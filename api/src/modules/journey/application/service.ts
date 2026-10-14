import type { Prisma, PrismaClient, StopKind } from "@prisma/client";
import { prisma as defaultPrisma } from "../../../infra/prisma/client.js";
import type { CacheStore } from "../../../shared/cache/index.js";
import { cacheKey, getOrSet } from "../../../shared/cache/index.js";
import {
  AppError,
  NotFoundError,
  PlanNeedsInputError,
  ValidationError,
} from "../../../shared/http/errors.js";
import {
  ApplicationLogService,
  type ApplicationLogDb,
} from "../../../shared/logging/application-log.js";
import {
  APPLICATION_LOG_STATUS,
  APPLICATION_LOG_TYPE,
} from "../../../shared/logging/application-log-types.js";
import type { CostService } from "../../cost/service.js";
import type { ImageService } from "../../images/index.js";
import { PolicyService } from "../../policy/service.js";
import type { PlannerService } from "../../planner/service.js";
import type { PlanSkeletonInput, TripSkeleton } from "../../planner/domain/skeleton.js";
import { normalizeTripSkeleton } from "../../planner/domain/normalize-skeleton.js";
import type { PlannerToolContext } from "../../../shared/mcp/index.js";
import { coverImageUrlFromStops, coverLocationFromTrip } from "./cover-image.js";
import { serializeTrip } from "./serialize-trip.js";
import { serializePlanResponse } from "./serialize-plan-response.js";
import { mergePlanPreferences, type StoredTravelPreference } from "./merge-plan-preferences.js";
import { buildPlanDrafts, slugify, type PlanMediaDraft, type PlanStopDraft } from "./persist-plan.js";
import { createCatalogLink } from "./write-catalog.js";
import { resolvePlanDates } from "../../planner/domain/clarifications.js";
import {
  applyPlanAnswers,
  ensureCriticalClarifications,
  filterResolvedClarifications,
  hasConcreteTravelDates,
  mergeExtractedPreferences,
  publicExtractedSlots,
  requiredTravelDateClarification,
  splitClarifications,
} from "../../planner/domain/extract-slots.js";
import type { PlanningChatState } from "../../planner/domain/planning-draft.js";
import {
  applySelectedStop,
  buildPlanningChatState,
  canSearchDraft,
  draftCardFromSkeleton,
  draftRowDataFromCard,
  draftsEqual,
  emptyDraftCard,
  mergeSkeletonIntoDraft,
  planningPromptFromDraft,
  preferencesFromDraft,
  skeletonFromDraftCard,
  snapshotCard,
  textHistoryFromMessages,
  tripUpdateFromDraft,
} from "./planning-chat.js";
import { randomUUID } from "node:crypto";

export type CreateTripInput = {
  userId: string;
  title: string;
  originCity?: string;
  destinationSummary?: string;
  startDate?: string;
  endDate?: string;
  partySize?: number;
};

export type JourneyServiceOptions = {
  cache?: CacheStore;
  ttlSeconds?: number;
  planner?: PlannerService;
  cost?: CostService;
  policy?: PolicyService;
  images?: ImageService;
  logs?: ApplicationLogService;
};

type JourneyDb = Pick<
  PrismaClient,
  | "user"
  | "trip"
  | "journey"
  | "stop"
  | "booking"
  | "media"
  | "note"
  | "catalogFlight"
  | "catalogHotel"
  | "catalogEvent"
  | "catalogPlace"
  | "catalogRoute"
  | "catalogWeather"
  | "catalogVisa"
  | "catalogChecklist"
  | "planningDraft"
  | "planningMessage"
  | "$transaction"
> &
  ApplicationLogDb;

const stopGraphInclude = {
  bookings: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      flight: true,
      hotel: true,
      event: true,
      place: true,
      route: true,
      weather: true,
      visa: true,
      checklist: true,
    },
  },
  medias: { orderBy: { sortOrder: "asc" as const } },
  notes: true,
  budgets: true,
} satisfies Prisma.StopInclude;

const tripGraphInclude = {
  journey: {
    include: {
      stops: {
        where: { deletedAt: null },
        orderBy: [{ depth: "asc" as const }, { sortOrder: "asc" as const }],
        include: stopGraphInclude,
      },
    },
  },
  checklists: true,
} satisfies Prisma.TripInclude;

export class JourneyService {
  private readonly cache?: CacheStore;
  private readonly ttlSeconds: number;
  private readonly planner?: PlannerService;
  private readonly cost?: CostService;
  private readonly policy: PolicyService;
  private readonly images?: ImageService;
  private readonly logs: ApplicationLogService;

  constructor(
    private readonly db: JourneyDb = defaultPrisma,
    options: JourneyServiceOptions = {},
  ) {
    this.cache = options.cache;
    this.ttlSeconds = options.ttlSeconds ?? 60;
    this.planner = options.planner;
    this.cost = options.cost;
    this.policy = options.policy ?? new PolicyService();
    this.images = options.images;
    this.logs = options.logs ?? new ApplicationLogService(this.db);
  }

  async ensureUser(firebaseUid: string, email: string) {
    return this.db.user.upsert({
      where: { firebaseUid },
      update: { email },
      create: { firebaseUid, email },
    });
  }

  async createTrip(input: CreateTripInput) {
    const trip = await this.db.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.trip.create({
        data: {
          userId: input.userId,
          title: input.title,
          originCity: input.originCity,
          destinationSummary: input.destinationSummary,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined,
          partySize: input.partySize ?? 1,
          status: "draft",
        },
      });
      const journey = await tx.journey.create({
        data: {
          tripId: created.id,
          name: input.title,
        },
      });
      return { ...created, journey: { ...journey, stops: [] } };
    });

    await this.invalidateUserTrips(input.userId, trip.id);
    return serializeTrip(trip);
  }

  async listTrips(userId: string) {
    const trips = await getOrSet(
      {
        cache: this.cache,
        key: this.listKey(userId),
        ttlSeconds: this.ttlSeconds,
      },
      () =>
        this.db.trip.findMany({
          where: { userId },
          orderBy: { updatedAt: "desc" },
          include: tripGraphInclude,
        }).then((rows) => rows.map(serializeTrip)),
    );
    return Promise.all(trips.map((trip) => this.withCoverImage(trip)));
  }

  async getTrip(tripId: string, userId: string) {
    return getOrSet(
      {
        cache: this.cache,
        key: this.tripKey(tripId, userId),
        ttlSeconds: this.ttlSeconds,
      },
      async () => {
        const trip = await this.db.trip.findFirst({
          where: { id: tripId, userId },
          include: tripGraphInclude,
        });
        if (!trip) throw new NotFoundError("Trip not found");
        return serializeTrip(trip);
      },
    ).then((trip) => this.withCoverImage(trip));
  }

  /** Public trip/plan payload: stops + catalog. */
  async getTripPlan(tripId: string, userId: string) {
    const trip = await this.getTrip(tripId, userId);
    return serializePlanResponse({ trip });
  }

  /** Resume planning chat: messages + live draft. No provider calls. */
  async getPlanningChat(tripId: string, userId: string): Promise<PlanningChatState> {
    const trip = await this.db.trip.findFirst({
      where: { id: tripId, userId },
      select: { id: true, destinationSummary: true },
    });
    if (!trip) throw new NotFoundError("Trip not found");

    const [draft, messages] = await Promise.all([
      this.db.planningDraft.findUnique({ where: { tripId } }),
      this.db.planningMessage.findMany({
        where: { tripId },
        orderBy: { position: "asc" },
      }),
    ]);

    return buildPlanningChatState({
      tripId,
      draft,
      messages,
      destinationSummary: trip.destinationSummary,
    });
  }

  /**
   * Append a user chat turn, revise the live draft via LLM only, and return full chat state.
   * Provider APIs are not called here.
   */
  async postPlanningMessage(input: {
    tripId: string;
    userId: string;
    text: string;
    stopId?: string;
    answers?: Record<string, unknown>;
  }): Promise<PlanningChatState> {
    if (!this.planner) throw new ValidationError("Planner is not configured");
    const text = input.text?.trim();
    if (!text) throw new ValidationError("text is required");

    const trip = await this.db.trip.findFirst({
      where: { id: input.tripId, userId: input.userId },
      include: { journey: true },
    });
    if (!trip) throw new NotFoundError("Trip not found");
    if (trip.status !== "draft" && trip.status !== "planning") {
      throw new ValidationError("Planning chat is closed for this trip");
    }

    const existingDraft = await this.db.planningDraft.findUnique({
      where: { tripId: input.tripId },
    });
    const existingMessages = await this.db.planningMessage.findMany({
      where: { tripId: input.tripId },
      orderBy: { position: "asc" },
    });
    const nextPosition = (existingMessages[existingMessages.length - 1]?.position ?? -1) + 1;

    const storedPreference = await this.readStoredPreference(input.userId);
    let liveDraft = applySelectedStop(
      existingDraft ? buildPlanningChatState({
        tripId: input.tripId,
        draft: existingDraft,
        messages: [],
        destinationSummary: trip.destinationSummary,
      }).draft : emptyDraftCard(),
      input.stopId,
    );

    const preferences = applyPlanAnswers(
      mergePlanPreferences({
        stored: storedPreference,
        request: preferencesFromDraft(liveDraft),
        tripOriginCity: trip.originCity,
      }),
      input.answers,
    );

    const userMessageId = randomUUID();
    await this.db.planningMessage.create({
      data: {
        id: userMessageId,
        tripId: input.tripId,
        position: nextPosition,
        role: "user",
        kind: "text",
        body: text,
        draftStopId: input.stopId ?? null,
      },
    });

    try {
      return await this.continuePlanningAfterUserMessage({
        tripId: input.tripId,
        userId: input.userId,
        text,
        stopId: input.stopId,
        answers: input.answers,
        trip,
        existingDraft,
        existingMessages,
        nextPosition,
        liveDraft,
        preferences,
      });
    } catch (err) {
      const debug = formatPlanningErrorDebug(err);
      console.error("[traverior-api:planning/messages] failed", {
        tripId: input.tripId,
        userId: input.userId,
        stopId: input.stopId ?? null,
        textPreview: text.length > 160 ? `${text.slice(0, 160)}…` : text,
        hasExistingDraft: Boolean(existingDraft),
        draftStopCount: liveDraft.stops.length,
        messageCount: existingMessages.length,
        ...debug,
      });
      if (debug.stack) {
        console.error("[traverior-api:planning/messages] stack\n", debug.stack);
      }
      const body = planningAssistantErrorMessage(err);
      await this.appendPlanningAssistantError({
        tripId: input.tripId,
        userId: input.userId,
        body,
      });
      return this.getPlanningChat(input.tripId, input.userId);
    }
  }

  private async continuePlanningAfterUserMessage(input: {
    tripId: string;
    userId: string;
    text: string;
    stopId?: string;
    answers?: Record<string, unknown>;
    trip: {
      originCity: string | null;
      destinationSummary: string | null;
    };
    existingDraft: Awaited<ReturnType<JourneyDb["planningDraft"]["findUnique"]>>;
    existingMessages: Awaited<ReturnType<JourneyDb["planningMessage"]["findMany"]>>;
    nextPosition: number;
    liveDraft: ReturnType<typeof emptyDraftCard>;
    preferences: PlanSkeletonInput["preferences"];
  }): Promise<PlanningChatState> {
    if (!this.planner) throw new ValidationError("Planner is not configured");

    let liveDraft = input.liveDraft;
    let assistantMessages: Array<{
      role: "assistant";
      kind: "text" | "skeleton" | "clarification";
      body: string | null;
      draftStopId?: string | null;
      payload?: Prisma.InputJsonValue | null;
    }> = [];

    const hasDraftStops = liveDraft.stops.some(
      (stop) => stop.kind === "stay" || stop.kind === "transit",
    );

    if (!hasDraftStops) {
      const preferences = input.preferences ?? {};
      const slots = await this.planner.extractPlanSlots({
        prompt: input.text,
        preferences,
      });
      const mergedPreferences = mergeExtractedPreferences(preferences, slots.extracted);
      if (slots.extracted.destination && !liveDraft.destinationSummary) {
        liveDraft = {
          ...liveDraft,
          destinationSummary: slots.extracted.destination,
          originCity: mergedPreferences.originCity ?? liveDraft.originCity,
          startDate: mergedPreferences.startDate ?? liveDraft.startDate,
          endDate: mergedPreferences.endDate ?? liveDraft.endDate,
          partySize: mergedPreferences.partySize ?? liveDraft.partySize,
          budgetTone: mergedPreferences.budgetTone ?? liveDraft.budgetTone,
        };
      } else {
        liveDraft = {
          ...liveDraft,
          originCity: mergedPreferences.originCity ?? liveDraft.originCity,
          startDate: mergedPreferences.startDate ?? liveDraft.startDate,
          endDate: mergedPreferences.endDate ?? liveDraft.endDate,
          partySize: mergedPreferences.partySize ?? liveDraft.partySize,
          budgetTone: mergedPreferences.budgetTone ?? liveDraft.budgetTone,
        };
      }

      const missing = ensureCriticalClarifications(
        filterResolvedClarifications(slots.missing, mergedPreferences, input.answers),
        mergedPreferences,
      );
      const { required } = splitClarifications(missing);

      if (required.length > 0) {
        assistantMessages = [
          {
            role: "assistant",
            kind: "text",
            body: "Ada beberapa detail yang masih dibutuhkan sebelum rancangan bisa dilanjutkan.",
          },
          ...required.map((clarification) => ({
            role: "assistant" as const,
            kind: "clarification" as const,
            body: clarification.question,
            payload: { clarification } as Prisma.InputJsonValue,
          })),
        ];
        await this.persistPlanningTurn({
          tripId: input.tripId,
          userId: input.userId,
          startPosition: input.nextPosition + 1,
          draft: liveDraft,
          phase: "collecting",
          tripPatch: tripUpdateFromDraft(liveDraft),
          assistantMessages,
        });
        return this.getPlanningChat(input.tripId, input.userId);
      }

      const { skeleton } = await this.planner.planSkeleton(
        { prompt: input.text, preferences: mergedPreferences },
        {
          tripOriginCity: input.trip.originCity,
          preferences: mergedPreferences,
        },
        { tripId: input.tripId, userId: input.userId },
      );
      const nextDraft = applySelectedStop(draftCardFromSkeleton(skeleton), input.stopId);
      const reply =
        nextDraft.concept && nextDraft.tone
          ? `Konsepnya ${nextDraft.concept}. ${nextDraft.tone} Ini rancangannya.`
          : "Ini rancangan perjalanannya. Penerbangan dan hotel belum dicari.";
      assistantMessages = [
        { role: "assistant", kind: "text", body: reply },
        {
          role: "assistant",
          kind: "skeleton",
          body: null,
          draftStopId: nextDraft.selectedStopId,
          payload: { card: snapshotCard(nextDraft) } as Prisma.InputJsonValue,
        },
      ];
      await this.persistPlanningTurn({
        tripId: input.tripId,
        userId: input.userId,
        startPosition: input.nextPosition + 1,
        draft: nextDraft,
        phase: "draft",
        tripPatch: tripUpdateFromDraft(nextDraft),
        assistantMessages,
      });
      return this.getPlanningChat(input.tripId, input.userId);
    }

    const history = textHistoryFromMessages(input.existingMessages);
    const revision = await this.planner.revisePlanningDraft({
      history,
      currentDraft: liveDraft,
      latestMessage: input.text,
      stopId: input.stopId,
      preferences: input.preferences,
      normalizeOptions: {
        tripOriginCity: input.trip.originCity,
        preferences: input.preferences,
      },
      logContext: { tripId: input.tripId, userId: input.userId },
    });

    let nextDraft = liveDraft;
    let phase: "collecting" | "draft" =
      input.existingDraft?.phase === "collecting" ? "collecting" : "draft";
    assistantMessages = [{ role: "assistant", kind: "text", body: revision.reply }];

    if (revision.clarifications.length > 0) {
      phase = "collecting";
      assistantMessages.push(
        ...revision.clarifications.map((clarification) => ({
          role: "assistant" as const,
          kind: "clarification" as const,
          body: clarification.question,
          payload: { clarification } as Prisma.InputJsonValue,
        })),
      );
    }

    if (revision.skeleton) {
      nextDraft = mergeSkeletonIntoDraft(liveDraft, revision.skeleton, input.stopId);
      if (!draftsEqual(liveDraft, nextDraft)) {
        phase = canSearchDraft(nextDraft, "draft") ? "draft" : "collecting";
        assistantMessages.push({
          role: "assistant",
          kind: "skeleton",
          body: null,
          draftStopId: nextDraft.selectedStopId,
          payload: { card: snapshotCard(nextDraft) } as Prisma.InputJsonValue,
        });
      }
    }

    await this.persistPlanningTurn({
      tripId: input.tripId,
      userId: input.userId,
      startPosition: input.nextPosition + 1,
      draft: nextDraft,
      phase,
      tripPatch: tripUpdateFromDraft(nextDraft),
      assistantMessages,
    });
    return this.getPlanningChat(input.tripId, input.userId);
  }

  private async appendPlanningAssistantError(input: {
    tripId: string;
    userId: string;
    body: string;
  }) {
    const latest = await this.db.planningMessage.findFirst({
      where: { tripId: input.tripId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const position = (latest?.position ?? -1) + 1;
    await this.db.planningMessage.create({
      data: {
        id: randomUUID(),
        tripId: input.tripId,
        position,
        role: "assistant",
        kind: "text",
        body: input.body,
      },
    });
    await this.invalidateUserTrips(input.userId, input.tripId);
  }

  /**
   * Lock the live draft and run provider search (existing planTrip pipeline).
   */
  async searchPlanningDraft(input: {
    tripId: string;
    userId: string;
    context?: PlannerToolContext;
  }): Promise<{ planning: PlanningChatState; plan: unknown }> {
    if (!this.planner) throw new ValidationError("Planner is not configured");

    const state = await this.getPlanningChat(input.tripId, input.userId);
    if (!state.canSearch) {
      throw new ValidationError("Draft is not ready to search");
    }

    await this.db.planningDraft.update({
      where: { tripId: input.tripId },
      data: { phase: "searching" },
    });

    const skeleton = skeletonFromDraftCard(state.draft);
    const prompt = planningPromptFromDraft(state.draft, state.draft.title || "Trip");
    const preferences = preferencesFromDraft(state.draft);

    try {
      const plan = await this.planTrip({
        tripId: input.tripId,
        userId: input.userId,
        prompt,
        preferences,
        answers: {
          startDate: state.draft.startDate,
          endDate: state.draft.endDate,
          originCity: state.draft.originCity,
          partySize: state.draft.partySize,
        },
        context: input.context,
        executeTools: true,
        skeleton,
      });

      const messages = await this.db.planningMessage.findMany({
        where: { tripId: input.tripId },
        orderBy: { position: "asc" },
      });
      const position = (messages[messages.length - 1]?.position ?? -1) + 1;
      await this.db.planningMessage.create({
        data: {
          id: randomUUID(),
          tripId: input.tripId,
          position,
          role: "assistant",
          kind: "text",
          body: "Pencarian dimulai. Penerbangan, hotel, dan detail lainnya sedang dicari.",
        },
      });
      await this.db.planningDraft.update({
        where: { tripId: input.tripId },
        data: { phase: "ready" },
      });

      return {
        planning: await this.getPlanningChat(input.tripId, input.userId),
        plan,
      };
    } catch (err) {
      await this.db.planningDraft.update({
        where: { tripId: input.tripId },
        data: { phase: "draft" },
      });
      throw err;
    }
  }

  private async persistPlanningTurn(input: {
    tripId: string;
    userId: string;
    startPosition: number;
    draft: ReturnType<typeof emptyDraftCard>;
    phase: "collecting" | "draft" | "searching" | "ready";
    tripPatch: ReturnType<typeof tripUpdateFromDraft>;
    assistantMessages: Array<{
      role: "assistant";
      kind: "text" | "skeleton" | "clarification";
      body: string | null;
      draftStopId?: string | null;
      payload?: Prisma.InputJsonValue | null;
    }>;
  }) {
    await this.db.$transaction(async (tx) => {
      const data = draftRowDataFromCard(input.draft, input.phase);
      await tx.planningDraft.upsert({
        where: { tripId: input.tripId },
        create: {
          id: randomUUID(),
          tripId: input.tripId,
          ...data,
        },
        update: data,
      });

      if (Object.keys(input.tripPatch).length > 0) {
        await tx.trip.update({
          where: { id: input.tripId },
          data: input.tripPatch,
        });
      }

      for (const [index, message] of input.assistantMessages.entries()) {
        await tx.planningMessage.create({
          data: {
            id: randomUUID(),
            tripId: input.tripId,
            position: input.startPosition + index,
            role: message.role,
            kind: message.kind,
            body: message.body,
            draftStopId: message.draftStopId ?? null,
            payload: message.payload ?? undefined,
          },
        });
      }
    });

    await this.invalidateUserTrips(input.userId, input.tripId);
  }

  async listChildren(tripId: string, userId: string, parentId: string | null) {
    const trip = await this.getTrip(tripId, userId);
    const journey = trip.journey;
    if (!journey?.id) return [];
    return getOrSet(
      {
        cache: this.cache,
        key: this.childrenKey(tripId, userId, parentId),
        ttlSeconds: this.ttlSeconds,
      },
      () =>
        this.db.stop.findMany({
          where: {
            journeyId: journey.id,
            parentStopId: !parentId || parentId === journey.id ? null : parentId,
            deletedAt: null,
          },
          orderBy: { sortOrder: "asc" },
        }).then((stops) => stops.map((stop) => stopAsNode(stop, journey.id))),
    );
  }

  async addNode(input: {
    tripId: string;
    userId: string;
    parentId: string;
    type: "CHECKPOINT" | "LEG" | "ACTIVITY" | "POI" | "BOOKING" | "MODULE" | "LEAF";
    title: string;
    contentType?: string;
    content?: object;
    costAmount?: number;
    costCurrency?: string;
    durationMinutes?: number;
    deepLinkUrl?: string;
    provider?: string;
    providerRef?: string;
    origin?: "ai" | "user" | "api";
    isCustom?: boolean;
  }) {
    const trip = await this.getTrip(input.tripId, input.userId);
    const journey = trip.journey;
    if (!journey?.id) throw new ValidationError("Trip journey missing");
    const parentStop = (journey.stops ?? []).find((stop) => stop.id === input.parentId) ?? null;
    if (!parentStop && input.parentId !== journey.id) {
      throw new ValidationError("parentId not found in trip");
    }

    const siblings = (journey.stops ?? []).filter((stop) =>
      parentStop ? stop.parentStopId === parentStop.id : stop.parentStopId == null,
    );
    const used = new Set((journey.stops ?? []).map((stop) => stop.slug));
    const slug = unusedSlug(slugify(input.title), used);
    const kind = nodeTypeToKind(input.type);
    const parentPath = parentStop?.path ?? "journey";
    const stop = await this.db.stop.create({
      data: {
        journeyId: journey.id,
        parentStopId: parentStop?.id ?? null,
        kind,
        hubRole: kind === "hub" ? "origin" : null,
        slug,
        name: input.title,
        sortOrder: siblings.length,
        depth: parentStop ? parentStop.depth + 1 : 0,
        path: `${parentPath}/${slug}`,
        city: input.title,
        origin: input.origin ?? "user",
        isCustom: input.isCustom ?? true,
      },
    });

    await this.invalidateUserTrips(input.userId, input.tripId, input.parentId);
    return stopAsNode(stop, journey.id);
  }

  /**
   * Toggle / update a single checklist item inside `catalog_checklists.items` JSON.
   * One catalog row holds the whole checklist; items stay nested (not one-row-per-item).
   */
  async updateChecklistItem(input: {
    tripId: string;
    userId: string;
    checklistId: string;
    itemId: string;
    done: boolean;
  }) {
    const trip = await this.db.trip.findFirst({
      where: { id: input.tripId, userId: input.userId },
      select: { id: true },
    });
    if (!trip) throw new NotFoundError("Trip not found");

    const checklist = await this.db.catalogChecklist.findFirst({
      where: { id: input.checklistId, tripId: input.tripId },
    });
    if (!checklist) throw new NotFoundError("Checklist not found");

    const items = normalizeChecklistItems(checklist.items);
    const index = items.findIndex((item) => item.id === input.itemId);
    if (index < 0) throw new NotFoundError("Checklist item not found");

    const nextItems = items.map((item, i) =>
      i === index ? { ...item, done: input.done } : item,
    );

    const updated = await this.db.catalogChecklist.update({
      where: { id: checklist.id },
      data: { items: nextItems as Prisma.InputJsonValue },
    });

    await this.invalidateUserTrips(input.userId, input.tripId);

    return {
      id: updated.id,
      tripId: updated.tripId,
      title: updated.title,
      provider: updated.provider,
      items: normalizeChecklistItems(updated.items),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * Full plan flow: LLM skeleton → MCP tools → persist stops and catalog → cost roll-up.
   * Pass `skeleton` to skip slot extraction / skeleton LLM (used by planning chat search).
   */
  async planTrip(input: {
    tripId: string;
    userId: string;
    prompt: string;
    preferences?: PlanSkeletonInput["preferences"];
    answers?: Record<string, unknown>;
    context?: PlannerToolContext;
    executeTools?: boolean;
    skeleton?: TripSkeleton;
  }) {
    if (!this.planner) {
      throw new ValidationError("Planner is not configured");
    }

    const trip = await this.getTrip(input.tripId, input.userId);
    const storedPreference = await this.readStoredPreference(input.userId);
    const preferences = applyPlanAnswers(
      mergePlanPreferences({
        stored: storedPreference,
        request: input.preferences,
        tripOriginCity: trip.originCity,
      }),
      input.answers,
    );

    let mergedPreferences = preferences;
    let slots: Awaited<ReturnType<PlannerService["extractPlanSlots"]>> | null = null;
    let recommended: ReturnType<typeof splitClarifications>["recommended"] = [];
    if (!input.skeleton) {
      slots = await this.planner.extractPlanSlots({
        prompt: input.prompt,
        preferences,
      });
      mergedPreferences = mergeExtractedPreferences(preferences, slots.extracted);
      const missing = ensureCriticalClarifications(
        filterResolvedClarifications(slots.missing, mergedPreferences, input.answers),
        mergedPreferences,
      );
      const split = splitClarifications(missing);
      recommended = split.recommended;
      if (split.required.length > 0) {
        throw new PlanNeedsInputError(split.required, {
          extracted: publicExtractedSlots(mergedPreferences),
        });
      }
    }

    await this.db.trip.update({
      where: { id: input.tripId },
      data: { status: "planning" },
    });

    const initialLogPayload = {
      prompt: input.prompt,
      request: {
        preferences: mergedPreferences,
        answers: input.answers,
        context: input.context,
        executeTools: input.executeTools !== false,
        providedSkeleton: Boolean(input.skeleton),
      },
      slotExtraction: slots,
    };
    const planLog = await this.logs.start({
      type: APPLICATION_LOG_TYPE.PLAN_PROCESS,
      source: "journey.planTrip",
      status: APPLICATION_LOG_STATUS.IN_PROGRESS,
      message: "Trip planning started",
      tripId: input.tripId,
      userId: input.userId,
      payload: initialLogPayload,
    });

    try {
      const executeTools = input.executeTools !== false;
      const planned = input.skeleton
        ? { skeleton: input.skeleton, llm: this.planner.llmName }
        : await this.planner.planSkeleton(
            {
              prompt: input.prompt,
              preferences: mergedPreferences,
            },
            {
              tripOriginCity: trip.originCity,
              preferences: mergedPreferences,
            },
            {
              tripId: input.tripId,
              userId: input.userId,
            },
          );
      // Locked drafts skip planSkeleton — still normalize so origin/airport IATA and
      // first/last flight needs exist before provider search.
      const skeleton = normalizeTripSkeleton(planned.skeleton, {
        tripOriginCity: trip.originCity,
        preferences: mergedPreferences,
      });
      const llm = planned.llm;
      await planLog?.progress({
        message: input.skeleton ? "Locked planning draft loaded" : "LLM skeleton generated",
        payload: {
          ...initialLogPayload,
          skeleton,
          providers: { llm },
        },
      });

      const dates = resolvePlanDates({
        prompt: input.prompt,
        preferences: mergedPreferences,
        context: input.context,
        trip: {
          startDate: trip.startDate,
          endDate: trip.endDate,
          originCity: trip.originCity,
        },
        assumedStartDate: skeleton.assumedStartDate,
        assumedEndDate: skeleton.assumedEndDate,
      });

      if (!hasConcreteTravelDates(mergedPreferences, input.answers) || !dates.start) {
        throw new PlanNeedsInputError([requiredTravelDateClarification()], {
          extracted: publicExtractedSlots(mergedPreferences),
        });
      }

      const journeyId = trip.journey?.id;
      if (!journeyId) throw new ValidationError("Trip journey missing");

      const context: PlannerToolContext = {
        adults: mergedPreferences.partySize ?? trip.partySize,
        passportCountry: mergedPreferences.passportCountry,
        checkIn: dates.start,
        checkOut: dates.end,
        departureDate: dates.start,
        returnDate: dates.end,
        ...input.context,
        originIata: input.context?.originIata ?? skeleton.originIata,
        destinationIata:
          input.context?.destinationIata ?? skeleton.checkpoints[0]?.airportIata,
      };

      const execution = executeTools
        ? await this.planner.executeSkeletonNeeds(skeleton, context)
        : {
            mcp: this.planner.mcpName,
            checkpoints: skeleton.checkpoints.map((checkpoint) => ({
              checkpoint,
              results: [],
            })),
          };

      const drafts = await this.enrichStopImages(
        buildPlanDrafts(skeleton, execution, {
          originCity: skeleton.originCity,
          returnCity: skeleton.originCity,
          originIata: skeleton.originIata ?? context.originIata,
          startDate: dates.start,
          endDate: dates.end,
        }),
      );
      await this.replaceAiPlan({
        tripId: input.tripId,
        journeyId,
        baseCurrency: trip.baseCurrency,
        drafts,
      });

      if (this.cost) {
        await this.cost.rollupTrip(input.tripId);
      }

      await this.db.trip.update({
        where: { id: input.tripId },
        data: {
          status: "ready",
          title: skeleton.title || trip.title,
          originCity: skeleton.originCity ?? trip.originCity,
          destinationSummary: skeleton.destinationSummary ?? trip.destinationSummary,
          startDate: dates.start ? new Date(dates.start) : dates.mode === "flexible" ? null : trip.startDate,
          endDate: dates.end ? new Date(dates.end) : dates.mode === "flexible" ? null : trip.endDate,
          partySize: skeleton.partySize ?? trip.partySize,
          planningVersion: { increment: 1 },
          lastPlannedAt: new Date(),
        },
      });
      await this.db.journey.update({
        where: { id: journeyId },
        data: {
          name: skeleton.title || trip.title,
          ...(skeleton.destinationSummary ? { summary: skeleton.destinationSummary } : {}),
        },
      });

      await this.invalidateUserTrips(input.userId, input.tripId);
      const updated = await this.getTrip(input.tripId, input.userId);

      const result = serializePlanResponse({
        trip: updated,
        llm,
        mcp: execution.mcp,
        clarifications: recommended,
      });

      await planLog?.complete({
        message: "Trip planning completed",
        payload: {
          ...initialLogPayload,
          skeleton,
          execution,
          providers: { llm, mcp: execution.mcp },
        },
        result,
      });

      return result;
    } catch (err) {
      await planLog?.fail(err, "Trip planning failed");
      await this.db.trip.update({
        where: { id: input.tripId },
        data: { status: trip.status },
      });
      await this.invalidateUserTrips(input.userId, input.tripId);
      throw err;
    }
  }

  private async enrichStopImages(drafts: PlanStopDraft[]): Promise<PlanStopDraft[]> {
    if (!this.images) return drafts;

    return Promise.all(
      drafts.map(async (draft) => {
        if (draft.kind !== "stay" && draft.kind !== "hub") return draft;
        const city = draft.city || draft.name;
        if (!city) return draft;

        try {
          const images = await this.images!.searchByLocation(city, { perPage: 1 });
          const image = images[0];
          if (!image) return draft;
          const media: PlanMediaDraft = {
            imageUrl: image.imageUrl,
            thumbnailUrl: image.thumbUrl || image.imageUrl,
            provider: image.provider,
            providerRef: image.photoId,
            attribution: {
              photographerName: image.photographerName,
              photographerUrl: image.photographerUrl,
              unsplashUrl: image.unsplashUrl,
              provider: image.provider,
              photoId: image.photoId,
            },
          };
          return { ...draft, media };
        } catch (err) {
          console.warn("[traverior-api:images] stop enrich failed", {
            city,
            err: String(err),
          });
          return draft;
        }
      }),
    );
  }

  private async replaceAiPlan(input: {
    tripId: string;
    journeyId: string;
    baseCurrency: string;
    drafts: PlanStopDraft[];
  }) {
    const existing = await this.db.stop.findMany({
      where: {
        journeyId: input.journeyId,
        OR: [{ deletedAt: null }, { suppressAiRestore: true }],
      },
    });

    const { replaceable, preserved } = this.policy.planReplacement(
      existing.map((stop) => ({
        id: stop.id,
        path: stop.path,
        parentId: stop.parentStopId,
        kind: stop.kind,
        origin: stop.origin,
        isLocked: stop.isLocked,
        isCustom: stop.isCustom,
        suppressAiRestore: stop.suppressAiRestore,
        deletedAt: stop.deletedAt,
      })),
    );
    const now = new Date();
    for (const stop of replaceable) {
      if (stop.deletedAt) continue;
      await this.db.stop.update({
        where: { id: stop.id },
        data: { deletedAt: now },
      });
    }

    const pathToId = new Map<string, string>();
    const replaceableIds = new Set(replaceable.map((stop) => stop.id));
    let sortOrder = 0;
    for (const stop of existing) {
      if (stop.deletedAt || replaceableIds.has(stop.id)) continue;
      pathToId.set(stop.path, stop.id);
      sortOrder = Math.max(sortOrder, stop.sortOrder + 1);
    }

    const drafts = this.policy.filterDrafts(input.drafts, preserved);
    for (const draft of drafts) {
      if (pathToId.has(draft.path)) continue;
      const created = await this.db.stop.create({
        data: {
          journeyId: input.journeyId,
          parentStopId: null,
          kind: draft.kind,
          hubRole: draft.kind === "hub" ? (draft.hubRole ?? "origin") : null,
          slug: draft.slug,
          name: draft.name,
          subtitle: draft.subtitle,
          status: "planned",
          sortOrder,
          depth: 0,
          path: draft.path,
          days: draft.days,
          countryCode: countryCode(draft.countryCode),
          city: draft.city,
          scheduleStart: draft.scheduleStart,
          scheduleEnd: draft.scheduleEnd,
          dateStart: dayOrUndefined(draft.dateStart),
          dateEnd: dayOrUndefined(draft.dateEnd),
          origin: "ai",
          isCustom: false,
          lastRefreshedAt: now,
        },
      });
      sortOrder += 1;
      pathToId.set(draft.path, created.id);
      await this.attachDraft(input.tripId, created.id, input.baseCurrency, draft);
    }
  }

  private async attachDraft(tripId: string, stopId: string, baseCurrency: string, draft: PlanStopDraft) {
    let sortOrder = 0;
    for (const booking of draft.bookings) {
      const link = await createCatalogLink(this.db, tripId, booking);
      if (!Object.values(link).some(Boolean)) continue;
      await this.db.booking.create({
        data: {
          stopId,
          kind: booking.kind,
          role: booking.role,
          sortOrder,
          ...link,
          deepLinkUrl: booking.deepLinkUrl,
          costAmount: booking.costAmount,
          costCurrency: (booking.costCurrency ?? baseCurrency).slice(0, 3),
          costIsEstimate: true,
          origin: "ai",
        },
      });
      sortOrder += 1;
    }

    for (const note of draft.notes) {
      await this.db.note.create({
        data: {
          tripId,
          stopId,
          kind: note.kind,
          title: note.title,
          body: note.body,
          origin: "ai",
        },
      });
    }

    if (draft.media?.imageUrl) {
      await this.db.media.create({
        data: {
          tripId,
          stopId,
          role: "cover",
          imageUrl: draft.media.imageUrl,
          thumbnailUrl: draft.media.thumbnailUrl,
          provider: draft.media.provider,
          providerRef: draft.media.providerRef,
          attribution: draft.media.attribution as Prisma.InputJsonValue | undefined,
          sortOrder: 0,
        },
      });
    }
  }

  private async readStoredPreference(userId: string) {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      include: { preference: true },
    });
    const preference = user && "preference" in user ? user.preference : null;
    if (!preference) return null;
    return {
      budgetStyle: preference.budgetStyle as StoredTravelPreference["budgetStyle"],
      pace: preference.pace as StoredTravelPreference["pace"],
      homeCity: preference.homeCity,
      passportCountry: preference.passportCountry,
      extra: preference.extra,
    };
  }

  private async withCoverImage<
    T extends Parameters<typeof coverLocationFromTrip>[0] & { status?: string },
  >(trip: T) {
    const fromStops = coverImageUrlFromStops(trip.journey?.stops ?? undefined);
    if (fromStops) return { ...trip, coverImageUrl: fromStops };

    // Chat-planning drafts must not call Unsplash / other image providers.
    if (trip.status === "draft") {
      return { ...trip, coverImageUrl: null };
    }

    const location = coverLocationFromTrip(trip);
    if (!location || !this.images) return { ...trip, coverImageUrl: null };

    try {
      const url = await this.images.getLocationThumbnail(location);
      return { ...trip, coverImageUrl: url };
    } catch {
      return { ...trip, coverImageUrl: null };
    }
  }

  private listKey(userId: string) {
    return cacheKey("trips:list", { userId, v: 4 });
  }

  private tripKey(tripId: string, userId: string) {
    return cacheKey("trips:get", { tripId, userId, v: 4 });
  }

  private childrenKey(tripId: string, userId: string, parentId: string | null) {
    return cacheKey("trips:children", { tripId, userId, parentId, v: 4 });
  }

  private async invalidateUserTrips(
    userId: string,
    tripId?: string,
    parentId?: string | null,
  ) {
    if (!this.cache?.del) return;
    const keys = [this.listKey(userId)];
    if (tripId) {
      keys.push(this.tripKey(tripId, userId));
      keys.push(this.childrenKey(tripId, userId, null));
      if (parentId != null) keys.push(this.childrenKey(tripId, userId, parentId));
    }
    for (const key of keys) {
      try {
        await this.cache.del(key);
      } catch (err) {
        console.warn("[traverior-api:cache] del failed", { key, err: String(err) });
      }
    }
  }
}

type StoredChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  source: "template" | "visa" | "user";
};

function normalizeChecklistItems(raw: unknown): StoredChecklistItem[] {
  if (!Array.isArray(raw)) return [];
  const items: StoredChecklistItem[] = [];
  for (const [index, entry] of raw.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const label =
      typeof row.label === "string" && row.label.trim().length > 0
        ? row.label.trim()
        : typeof row.title === "string" && row.title.trim().length > 0
          ? row.title.trim()
          : null;
    if (!label) continue;
    const id =
      typeof row.id === "string" && row.id.trim().length > 0
        ? row.id.trim()
        : `item_${index + 1}`;
    const source =
      row.source === "visa" || row.source === "user" || row.source === "template"
        ? row.source
        : "template";
    items.push({
      id,
      label,
      done: Boolean(row.done),
      source,
    });
  }
  return items;
}

function formatPlanningErrorDebug(err: unknown): {
  name: string;
  message: string;
  code?: string;
  status?: number;
  details?: unknown;
  stack?: string;
} {
  if (err instanceof AppError) {
    return {
      name: err.name,
      message: err.message,
      code: err.code,
      status: err.status,
      details: err.details,
      stack: err.stack,
    };
  }
  if (err instanceof Error) {
    const maybe = err as Error & { code?: string; statusCode?: number; details?: unknown };
    return {
      name: err.name,
      message: err.message,
      code: maybe.code,
      status: maybe.statusCode,
      details: maybe.details,
      stack: err.stack,
    };
  }
  return { name: "UnknownError", message: String(err) };
}

function planningAssistantErrorMessage(err: unknown): string {
  const code = err instanceof AppError ? err.code : undefined;

  switch (code) {
    case "LLM_UPSTREAM_ERROR":
    case "LLM_INVALID_JSON":
    case "LLM_INVALID_SKELETON":
    case "LLM_INVALID_SLOTS":
      return "Maaf, saya belum bisa menyusun rancangan dari pesan itu. Coba tulis ulang dengan lebih jelas, atau kirim lagi sebentar.";
    case "VALIDATION_ERROR":
      return "Maaf, saya belum bisa memproses pesan itu. Coba perjelas tujuan, tanggal, atau ubah sedikit teksnya.";
    case "PLAN_NEEDS_INPUT":
      return "Ada beberapa detail yang masih kurang. Boleh lengkapi dulu, lalu kita lanjutkan rancangannya.";
    default:
      break;
  }

  return "Maaf, terjadi gangguan saat menyusun balasan. Silakan coba kirim pesan lagi.";
}

function dayOrUndefined(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function countryCode(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const code = value.trim().toUpperCase();
  return code.length >= 2 ? code.slice(0, 2) : undefined;
}

function unusedSlug(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  let index = 2;
  while (used.has(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

function nodeTypeToKind(type: string): StopKind {
  switch (type) {
    case "LEG":
      return "travel";
    case "CHECKPOINT":
      return "stay";
    default:
      return "activity";
  }
}

function stopAsNode(
  stop: {
    id: string;
    parentStopId?: string | null;
    depth?: number;
    path?: string;
    kind: string;
    hubRole?: string | null;
    name: string;
    subtitle?: string | null;
    status?: string;
    sortOrder?: number;
    scheduleStart?: Date | null;
    scheduleEnd?: Date | null;
    locationLat?: number | null;
    locationLng?: number | null;
    locationLabel?: string | null;
    city?: string | null;
    days?: number | null;
    countryCode?: string | null;
  },
  journeyId: string,
) {
  const checkpointKind =
    stop.hubRole === "origin"
      ? "ORIGIN"
      : stop.hubRole === "return"
        ? "RETURN"
        : stop.kind === "stay"
          ? "STAY"
          : stop.kind === "transit"
            ? "TRANSIT"
            : null;
  return {
    id: stop.id,
    parentId: stop.parentStopId ?? journeyId,
    depth: stop.depth ?? 0,
    path: stop.path ?? "",
    type: stop.kind === "travel" ? "LEG" : stop.kind === "activity" ? "ACTIVITY" : "CHECKPOINT",
    checkpointKind,
    title: stop.name,
    subtitle: stop.subtitle ?? null,
    status: stop.status ?? "planned",
    sortOrder: stop.sortOrder ?? 0,
    scheduleStart: stop.scheduleStart ?? null,
    scheduleEnd: stop.scheduleEnd ?? null,
    locationLat: stop.locationLat ?? null,
    locationLng: stop.locationLng ?? null,
    locationLabel: stop.locationLabel ?? stop.city ?? null,
    contentType: stop.kind === "travel" ? "leg" : "checkpoint",
    content: {
      city: stop.city ?? stop.name,
      days: stop.days ?? null,
      countryCode: stop.countryCode ?? null,
    },
    costAmount: 0,
    costCurrency: "IDR",
  };
}
