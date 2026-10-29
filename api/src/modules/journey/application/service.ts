import type { EditAction, Prisma, PrismaClient, StopKind, StopStatus } from "@prisma/client";
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
import { normalizeTripSkeleton } from "../../planner/domain/normalize-skeleton.js";
import type { PlanSkeletonInput, TripSkeleton } from "../../planner/domain/skeleton.js";
import type { PlannerToolContext } from "../../../shared/mcp/index.js";
import { coverImageUrlFromStops, coverLocationFromTrip } from "./cover-image.js";
import { serializeTrip } from "./serialize-trip.js";
import { serializePlanResponse } from "./serialize-plan-response.js";
import { mergePlanPreferences, type StoredTravelPreference } from "./merge-plan-preferences.js";
import { buildPlanDrafts, slugify, type PlanMediaDraft, type PlanStopDraft } from "./persist-plan.js";
import { createCatalogLink } from "./write-catalog.js";
import { resolvePlanDates } from "../../planner/domain/clarifications.js";
import { allocateCheckpointWindows, atUtcNoon } from "../../planner/domain/checkpoint-schedule.js";
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
  ApplicationLogDb & {
    stopEditLog?: PrismaClient["stopEditLog"];
  };

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
            body: "A few details are still needed before this draft can continue.",
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
          ? `This is a ${nextDraft.concept} trip. ${nextDraft.tone} Here's the draft.`
          : "Here's the trip draft. Flights and hotels have not been searched yet.";
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
          body: "Search started. Flights, hotels, and the rest of the details are being looked up.",
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
    locationLabel?: string;
    locationLat?: number;
    locationLng?: number;
    scheduleStart?: string;
    scheduleEnd?: string;
    days?: number;
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
    const isTopLevelHub = !parentStop && kind === "hub";
    const stop = await this.db.stop.create({
      data: {
        journeyId: journey.id,
        parentStopId: parentStop?.id ?? null,
        kind,
        hubRole: null,
        slug,
        name: input.title,
        sortOrder: siblings.length,
        depth: parentStop ? parentStop.depth + 1 : 0,
        path: `${parentPath}/${slug}`,
        city: input.locationLabel ?? input.title,
        locationLabel: input.locationLabel ?? input.title,
        locationLat: input.locationLat,
        locationLng: input.locationLng,
        scheduleStart: input.scheduleStart ? new Date(input.scheduleStart) : undefined,
        scheduleEnd: input.scheduleEnd ? new Date(input.scheduleEnd) : undefined,
        days: input.days ?? (isTopLevelHub ? 2 : null),
        origin: input.origin ?? "user",
        isCustom: input.isCustom ?? true,
      },
    });

    if (isTopLevelHub) {
      await this.reallocateHubWindows(trip.id, journey.id);
      if (this.cost) await this.cost.rollupTrip(input.tripId);
    }

    await this.invalidateUserTrips(input.userId, input.tripId, input.parentId);
    return stopAsNode(stop, journey.id);
  }

  async updateNode(input: {
    tripId: string;
    userId: string;
    nodeId: string;
    title?: string;
    subtitle?: string | null;
    status?: StopStatus;
    isLocked?: boolean;
    scheduleStart?: string | null;
    scheduleEnd?: string | null;
    dateStart?: string | null;
    dateEnd?: string | null;
    locationLabel?: string | null;
    locationLat?: number | null;
    locationLng?: number | null;
    days?: number | null;
    timeText?: string;
    matchTitle?: string;
    providerRef?: string;
  }) {
    const trip = await this.getTrip(input.tripId, input.userId);
    const journey = trip.journey;
    if (!journey?.id) throw new ValidationError("Trip journey missing");

    const existing = await this.db.stop.findFirst({
      where: {
        id: input.nodeId,
        journeyId: journey.id,
        deletedAt: null,
      },
    });
    if (!existing) {
      // Plan UI uses booking.id as nodeId for hotel/event/place catalog cards.
      return this.updateBookingNode({
        tripId: input.tripId,
        userId: input.userId,
        journeyId: journey.id,
        bookingId: input.nodeId,
        title: input.title,
        subtitle: input.subtitle,
        isLocked: input.isLocked,
        scheduleStart: input.scheduleStart,
        timeText: input.timeText,
        matchTitle: input.matchTitle,
        providerRef: input.providerRef,
        locationLabel: input.locationLabel,
        locationLat: input.locationLat,
        locationLng: input.locationLng,
      });
    }

    const beforeData = {
      name: existing.name,
      subtitle: existing.subtitle,
      status: existing.status,
      isLocked: existing.isLocked,
      scheduleStart: existing.scheduleStart,
      scheduleEnd: existing.scheduleEnd,
      dateStart: existing.dateStart,
      dateEnd: existing.dateEnd,
      locationLabel: existing.locationLabel,
      locationLat: existing.locationLat,
      locationLng: existing.locationLng,
      days: existing.days,
    };

    const action: EditAction =
      input.isLocked !== undefined && input.isLocked !== existing.isLocked
        ? input.isLocked
          ? "lock"
          : "unlock"
        : "edit";

    const updated = await this.db.stop.update({
      where: { id: existing.id },
      data: {
        name: input.title !== undefined ? input.title : undefined,
        subtitle: input.subtitle !== undefined ? input.subtitle : undefined,
        status: input.status !== undefined ? input.status : undefined,
        isLocked: input.isLocked !== undefined ? input.isLocked : undefined,
        scheduleStart:
          input.scheduleStart !== undefined
            ? input.scheduleStart
              ? new Date(input.scheduleStart)
              : null
            : undefined,
        scheduleEnd:
          input.scheduleEnd !== undefined
            ? input.scheduleEnd
              ? new Date(input.scheduleEnd)
              : null
            : undefined,
        dateStart:
          input.dateStart !== undefined ? dayOrUndefined(input.dateStart ?? undefined) ?? null : undefined,
        dateEnd:
          input.dateEnd !== undefined ? dayOrUndefined(input.dateEnd ?? undefined) ?? null : undefined,
        locationLabel: input.locationLabel !== undefined ? input.locationLabel : undefined,
        locationLat: input.locationLat !== undefined ? input.locationLat : undefined,
        locationLng: input.locationLng !== undefined ? input.locationLng : undefined,
        days: input.days !== undefined ? input.days : undefined,
        version: { increment: 1 },
      },
    });

    try {
      await this.db.stopEditLog?.create?.({
        data: {
          tripId: trip.id,
          stopId: existing.id,
          userId: trip.userId,
          action,
          before: beforeData as Prisma.InputJsonValue,
          after: {
            name: updated.name,
            subtitle: updated.subtitle,
            status: updated.status,
            isLocked: updated.isLocked,
            scheduleStart: updated.scheduleStart,
            scheduleEnd: updated.scheduleEnd,
            dateStart: updated.dateStart,
            dateEnd: updated.dateEnd,
            locationLabel: updated.locationLabel,
            locationLat: updated.locationLat,
            locationLng: updated.locationLng,
            days: updated.days,
          } as Prisma.InputJsonValue,
        },
      });
    } catch {
      // non-fatal
    }

    await this.invalidateUserTrips(input.userId, input.tripId, existing.parentStopId);
    return stopAsNode(updated, journey.id);
  }

  async replaceBooking(input: {
    tripId: string;
    userId: string;
    bookingId: string;
    offer: Record<string, unknown>;
    kind?: "flight" | "hotel" | "event" | "place";
    replaceKey?: string;
  }) {
    const trip = await this.getTrip(input.tripId, input.userId);
    let existing = await this.db.booking.findFirst({
      where: {
        id: input.bookingId,
        stop: { journey: { tripId: trip.id } },
      },
    });
    existing ??= await this.db.booking.findFirst({
      where: {
        stop: { journey: { tripId: trip.id } },
        OR: [
          { catalogPlaceId: input.bookingId },
          { catalogHotelId: input.bookingId },
          { catalogEventId: input.bookingId },
        ],
      },
    });
    if (!existing) {
      return this.replaceStopContent({
        tripId: input.tripId,
        userId: input.userId,
        stopId: input.bookingId,
        offer: input.offer,
      });
    }

    const kind = input.kind ?? (existing.kind === "hotel" || existing.kind === "event" || existing.kind === "flight" || existing.kind === "place"
      ? existing.kind
      : null);
    if (kind !== "flight" && kind !== "hotel" && kind !== "event" && kind !== "place") {
      throw new ValidationError("This booking type cannot be replaced");
    }

    if (kind === "place" && existing.catalogPlaceId) {
      await this.replaceCatalogPlaceItem({
        catalogPlaceId: existing.catalogPlaceId,
        offer: input.offer,
        replaceKey: input.replaceKey,
      });
      const updated = await this.db.booking.update({
        where: { id: existing.id },
        data: { role: "selected", origin: "user" },
      });
      await this.invalidateUserTrips(input.userId, input.tripId, existing.stopId);
      return {
        id: updated.id,
        kind: updated.kind,
        role: updated.role,
        deepLinkUrl: updated.deepLinkUrl,
        costAmount: updated.costAmount,
        costCurrency: updated.costCurrency,
      };
    }

    const price =
      input.offer.price && typeof input.offer.price === "object" && !Array.isArray(input.offer.price)
        ? (input.offer.price as Record<string, unknown>)
        : {};
    const costAmount =
      typeof price.amount === "number"
        ? price.amount
        : typeof input.offer.costAmount === "number"
          ? input.offer.costAmount
          : existing.costAmount
            ? Number(existing.costAmount)
            : undefined;
    const costCurrency =
      (typeof price.currency === "string" && price.currency) ||
      (typeof input.offer.costCurrency === "string" && input.offer.costCurrency) ||
      existing.costCurrency ||
      trip.baseCurrency;
    const deepLink =
      (typeof input.offer.deepLinkUrl === "string" && input.offer.deepLinkUrl) ||
      (typeof input.offer.deepLink === "string" && input.offer.deepLink) ||
      undefined;

    const link = await createCatalogLink(this.db, trip.id, {
      path: existing.id,
      kind,
      role: "selected",
      provider: typeof input.offer.provider === "string" ? input.offer.provider : undefined,
      providerRef:
        (typeof input.offer.providerRef === "string" && input.offer.providerRef) ||
        (typeof input.offer.hotelId === "string" && input.offer.hotelId) ||
        (typeof input.offer.externalId === "string" && input.offer.externalId) ||
        (typeof input.offer.flightNumber === "string" && input.offer.flightNumber) ||
        undefined,
      deepLinkUrl: deepLink,
      costAmount,
      costCurrency,
      payload: input.offer,
    });

    const updated = await this.db.booking.update({
      where: { id: existing.id },
      data: {
        kind,
        role: "selected",
        ...link,
        deepLinkUrl: deepLink ?? existing.deepLinkUrl,
        costAmount: costAmount ?? undefined,
        costCurrency: costCurrency?.slice(0, 3),
        costIsEstimate: true,
        origin: "user",
      },
    });

    await this.invalidateUserTrips(input.userId, input.tripId, existing.stopId);
    return {
      id: updated.id,
      kind: updated.kind,
      role: updated.role,
      deepLinkUrl: updated.deepLinkUrl,
      costAmount: updated.costAmount,
      costCurrency: updated.costCurrency,
    };
  }

  private async replaceCatalogPlaceItem(input: {
    catalogPlaceId: string;
    offer: Record<string, unknown>;
    replaceKey?: string;
  }) {
    const row = await this.db.catalogPlace.findFirst({
      where: { id: input.catalogPlaceId },
    });
    if (!row) throw new NotFoundError("Place catalog not found");
    const current = Array.isArray(row.places) ? [...row.places] : [];
    const places = current.filter((item) => item && typeof item === "object") as Record<string, unknown>[];
    const key = (input.replaceKey ?? "").trim().toLowerCase();
    const nextPlace = {
      ...input.offer,
      name: typeof input.offer.name === "string" ? input.offer.name : input.offer.title,
    };
    const index = places.findIndex((place) => {
      const id = typeof place.placeId === "string" ? place.placeId.toLowerCase() : "";
      const name = typeof place.name === "string" ? place.name.toLowerCase() : "";
      const title = typeof place.title === "string" ? place.title.toLowerCase() : "";
      return key.length > 0 && (id === key || name === key || title === key);
    });
    if (index >= 0) places[index] = nextPlace;
    else places.push(nextPlace);
    const raw =
      row.raw && typeof row.raw === "object" && !Array.isArray(row.raw)
        ? { ...(row.raw as Record<string, unknown>), places }
        : { places };
    await this.db.catalogPlace.update({
      where: { id: row.id },
      data: {
        places: places as Prisma.InputJsonValue,
        raw: raw as Prisma.InputJsonValue,
      },
    });
  }

  private async replaceStopContent(input: {
    tripId: string;
    userId: string;
    stopId: string;
    offer: Record<string, unknown>;
  }) {
    const trip = await this.getTrip(input.tripId, input.userId);
    const journey = trip.journey;
    if (!journey?.id) throw new ValidationError("Trip journey missing");
    const existing = await this.db.stop.findFirst({
      where: {
        id: input.stopId,
        journeyId: journey.id,
        deletedAt: null,
      },
    });
    if (!existing || (existing.kind !== "activity" && existing.kind !== "stay")) {
      throw new NotFoundError("Booking not found in trip");
    }
    const name =
      (typeof input.offer.name === "string" && input.offer.name) ||
      (typeof input.offer.title === "string" && input.offer.title) ||
      existing.name;
    const address =
      (typeof input.offer.formattedAddress === "string" && input.offer.formattedAddress) ||
      (typeof input.offer.address === "string" && input.offer.address) ||
      existing.locationLabel;
    const lat = typeof input.offer.lat === "number" ? input.offer.lat : existing.locationLat;
    const lng = typeof input.offer.lng === "number" ? input.offer.lng : existing.locationLng;
    await this.db.stop.update({
      where: { id: existing.id },
      data: {
        name,
        subtitle: address,
        locationLabel: address,
        locationLat: lat,
        locationLng: lng,
        version: { increment: 1 },
      },
    });
    await this.invalidateUserTrips(input.userId, input.tripId, existing.parentStopId);
    return {
      id: existing.id,
      kind: existing.kind,
      role: "selected",
      deepLinkUrl: null,
      costAmount: null,
      costCurrency: null,
    };
  }

  async setNodeLock(input: {
    tripId: string;
    userId: string;
    nodeId: string;
    isLocked: boolean;
  }) {
    return this.updateNode({
      tripId: input.tripId,
      userId: input.userId,
      nodeId: input.nodeId,
      isLocked: input.isLocked,
    });
  }

  /**
   * Catalog cards in the plan response expose booking.id as nodeId.
   * Edit / lock those through the booking + catalog row, not Stop.
   */
  private async updateBookingNode(input: {
    tripId: string;
    userId: string;
    journeyId: string;
    bookingId: string;
    title?: string;
    subtitle?: string | null;
    isLocked?: boolean;
    scheduleStart?: string | null;
    timeText?: string;
    matchTitle?: string;
    providerRef?: string;
    locationLabel?: string | null;
    locationLat?: number | null;
    locationLng?: number | null;
  }) {
    const booking = await this.db.booking.findFirst({
      where: {
        id: input.bookingId,
        stop: { journeyId: input.journeyId, deletedAt: null },
      },
      include: {
        hotel: true,
        event: true,
        place: true,
        flight: true,
        stop: true,
      },
    });
    if (!booking) {
      throw new NotFoundError("Node not found in trip");
    }

    const locationLabel =
      input.locationLabel !== undefined ? input.locationLabel : input.subtitle;
    let title = input.title;
    let isLocked = false;

    if (booking.kind === "hotel" && booking.catalogHotelId) {
      const raw = mergeRawLock(booking.hotel?.raw, input.isLocked);
      isLocked = rawLocked(raw);
      await this.db.catalogHotel.update({
        where: { id: booking.catalogHotelId },
        data: {
          ...(input.title !== undefined ? { name: input.title } : {}),
          ...(locationLabel !== undefined ? { address: locationLabel } : {}),
          ...(input.locationLat !== undefined ? { lat: input.locationLat } : {}),
          ...(input.locationLng !== undefined ? { lng: input.locationLng } : {}),
          ...(input.timeText !== undefined ? { checkInTime: input.timeText } : {}),
          ...(input.scheduleStart !== undefined
            ? {
                checkIn: input.scheduleStart
                  ? dayOrUndefined(input.scheduleStart.slice(0, 10))
                  : undefined,
              }
            : {}),
          raw: raw as Prisma.InputJsonValue,
        },
      });
      title = input.title ?? booking.hotel?.name ?? "Hotel";
    } else if (booking.kind === "event" && booking.catalogEventId) {
      const raw = mergeRawLock(booking.event?.raw, input.isLocked);
      isLocked = rawLocked(raw);
      await this.db.catalogEvent.update({
        where: { id: booking.catalogEventId },
        data: {
          ...(input.title !== undefined ? { name: input.title } : {}),
          ...(locationLabel !== undefined ? { address: locationLabel, venueName: locationLabel } : {}),
          ...(input.locationLat !== undefined ? { lat: input.locationLat } : {}),
          ...(input.locationLng !== undefined ? { lng: input.locationLng } : {}),
          ...(input.scheduleStart !== undefined
            ? { startsAt: input.scheduleStart ? new Date(input.scheduleStart) : null }
            : {}),
          raw: raw as Prisma.InputJsonValue,
        },
      });
      title = input.title ?? booking.event?.name ?? "Event";
    } else if (booking.kind === "place" && booking.catalogPlaceId) {
      const placeRow = booking.place;
      const raw = mergeRawLock(placeRow?.raw, input.isLocked);
      isLocked = rawLocked(raw);
      const places = Array.isArray(placeRow?.places)
        ? [...(placeRow!.places as unknown[])]
        : [];
      const matchTitle = input.matchTitle?.trim().toLowerCase();
      const providerRef = input.providerRef?.trim();
      let updatedPlaces = places;
      if (input.title !== undefined || locationLabel !== undefined) {
        updatedPlaces = places.map((entry) => {
          const row = entry && typeof entry === "object" ? { ...(entry as Record<string, unknown>) } : null;
          if (!row) return entry;
          const name = String(row.name ?? row.title ?? "").trim().toLowerCase();
          const ref = String(row.placeId ?? row.providerRef ?? row.id ?? "").trim();
          const matched =
            (providerRef && ref === providerRef) ||
            (matchTitle && name === matchTitle) ||
            (!providerRef && !matchTitle && places.length === 1);
          if (!matched) return entry;
          if (input.title !== undefined) {
            row.name = input.title;
            row.title = input.title;
          }
          if (locationLabel !== undefined && locationLabel !== null) {
            row.formattedAddress = locationLabel;
            row.address = locationLabel;
          }
          if (input.locationLat !== undefined) row.lat = input.locationLat;
          if (input.locationLng !== undefined) row.lng = input.locationLng;
          return row;
        });
      }
      await this.db.catalogPlace.update({
        where: { id: booking.catalogPlaceId },
        data: {
          ...(input.title !== undefined && !matchTitle && !providerRef
            ? { title: input.title }
            : {}),
          places: updatedPlaces as Prisma.InputJsonValue,
          raw: raw as Prisma.InputJsonValue,
        },
      });
      title = input.title ?? placeRow?.title ?? "Place";
    } else if (booking.kind === "flight" && booking.catalogFlightId) {
      const raw = mergeRawLock(booking.flight?.raw, input.isLocked);
      isLocked = rawLocked(raw);
      await this.db.catalogFlight.update({
        where: { id: booking.catalogFlightId },
        data: {
          ...(input.scheduleStart !== undefined
            ? { departureAt: input.scheduleStart ? new Date(input.scheduleStart) : null }
            : {}),
          raw: raw as Prisma.InputJsonValue,
        },
      });
      title = input.title ?? booking.flight?.airlineName ?? booking.flight?.carrier ?? "Flight";
    } else if (input.isLocked !== undefined) {
      throw new ValidationError("This booking type cannot be locked");
    } else {
      throw new ValidationError("This booking type cannot be edited");
    }

    await this.invalidateUserTrips(input.userId, input.tripId, booking.stopId);
    return {
      id: booking.id,
      parentId: booking.stopId,
      depth: 1,
      path: "",
      type: booking.kind === "hotel" ? "BOOKING" : "ACTIVITY",
      checkpointKind: null,
      title,
      subtitle: locationLabel ?? null,
      status: "planned",
      sortOrder: booking.sortOrder ?? 0,
      scheduleStart: input.scheduleStart ? new Date(input.scheduleStart) : null,
      scheduleEnd: null,
      locationLat: input.locationLat ?? null,
      locationLng: input.locationLng ?? null,
      locationLabel: locationLabel ?? null,
      contentType: booking.kind,
      content: {},
      costAmount: 0,
      costCurrency: "IDR",
      isLocked,
      isCustom: booking.origin === "user",
    };
  }

  async deleteNode(input: {
    tripId: string;
    userId: string;
    nodeId: string;
  }) {
    const trip = await this.getTrip(input.tripId, input.userId);
    const journey = trip.journey;
    if (!journey?.id) throw new ValidationError("Trip journey missing");

    const existing = await this.db.stop.findFirst({
      where: {
        id: input.nodeId,
        journeyId: journey.id,
        deletedAt: null,
      },
    });
    if (!existing) {
      const booking = await this.db.booking.findFirst({
        where: {
          id: input.nodeId,
          stop: { journeyId: journey.id, deletedAt: null },
        },
      });
      if (!booking) {
        throw new NotFoundError("Node not found in trip");
      }
      await this.db.booking.delete({ where: { id: booking.id } });
      await this.invalidateUserTrips(input.userId, input.tripId, booking.stopId);
      return { id: booking.id, deleted: true };
    }

    const now = new Date();
    await this.db.stop.update({
      where: { id: existing.id },
      data: {
        deletedAt: now,
        suppressAiRestore: true,
      },
    });

    await this.db.stop.updateMany({
      where: {
        journeyId: journey.id,
        path: { startsWith: `${existing.path}/` },
        deletedAt: null,
      },
      data: {
        deletedAt: now,
        suppressAiRestore: true,
      },
    });

    try {
      await this.db.stopEditLog?.create?.({
        data: {
          tripId: trip.id,
          stopId: existing.id,
          userId: trip.userId,
          action: "delete",
          before: {
            id: existing.id,
            name: existing.name,
            path: existing.path,
          } as Prisma.InputJsonValue,
        },
      });
    } catch {
      // non-fatal
    }

    if (existing.parentStopId == null && existing.kind === "hub") {
      await this.reallocateHubWindows(trip.id, journey.id);
      if (this.cost) await this.cost.rollupTrip(input.tripId);
    }

    await this.invalidateUserTrips(input.userId, input.tripId, existing.parentStopId);
    return { success: true, id: existing.id };
  }

  async reorderNodes(input: {
    tripId: string;
    userId: string;
    parentId?: string | null;
    nodeIds: string[];
  }) {
    const trip = await this.getTrip(input.tripId, input.userId);
    const journey = trip.journey;
    if (!journey?.id) throw new ValidationError("Trip journey missing");

    const stops = await this.db.stop.findMany({
      where: {
        id: { in: input.nodeIds },
        journeyId: journey.id,
        deletedAt: null,
      },
    });

    if (stops.length !== input.nodeIds.length) {
      throw new ValidationError("Some node IDs are invalid or not found in trip");
    }

    await this.db.$transaction(async (tx: Prisma.TransactionClient) => {
      const stopTx = tx?.stop ?? this.db.stop;
      for (const [index, id] of input.nodeIds.entries()) {
        await stopTx.update({
          where: { id },
          data: { sortOrder: index },
        });
      }
      if (stops[0]) {
        try {
          const editLogTx =
            (tx as { stopEditLog?: PrismaClient["stopEditLog"] })?.stopEditLog ??
            this.db.stopEditLog;
          await editLogTx?.create?.({
            data: {
              tripId: trip.id,
              stopId: stops[0].id,
              userId: trip.userId,
              action: "reorder",
              after: { nodeIds: input.nodeIds } as Prisma.InputJsonValue,
            },
          });
        } catch {
          // non-fatal
        }
      }
    });

    const reorderedHubs = stops.some((stop) => stop.parentStopId == null && stop.kind === "hub");
    if (reorderedHubs) {
      await this.reallocateHubWindows(trip.id, journey.id);
      if (this.cost) await this.cost.rollupTrip(input.tripId);
    }

    await this.invalidateUserTrips(input.userId, input.tripId, input.parentId ?? null);
    return { success: true };
  }

  /** Cheap cascade: redistribute date windows across remaining top-level hubs. */
  private async reallocateHubWindows(tripId: string, journeyId: string): Promise<void> {
    const trip = await this.db.trip.findUnique({
      where: { id: tripId },
      select: { startDate: true, endDate: true },
    });
    if (!trip?.startDate) return;

    const hubs = await this.db.stop.findMany({
      where: {
        journeyId,
        parentStopId: null,
        deletedAt: null,
        kind: "hub",
        hubRole: null,
      },
      orderBy: { sortOrder: "asc" },
      select: { id: true, days: true },
    });
    if (hubs.length === 0) return;

    const start = trip.startDate.toISOString().slice(0, 10);
    const end = trip.endDate ? trip.endDate.toISOString().slice(0, 10) : undefined;
    const windows = allocateCheckpointWindows(
      hubs.map((hub) => ({ days: Math.max(1, hub.days ?? 2) })),
      { start, end },
    );

    for (let i = 0; i < hubs.length; i += 1) {
      const hub = hubs[i]!;
      const window = windows[i];
      if (!window) continue;
      await this.db.stop.update({
        where: { id: hub.id },
        data: {
          days: window.days,
          dateStart: atUtcNoon(window.start) ?? null,
          dateEnd: atUtcNoon(window.end) ?? null,
          scheduleStart: atUtcNoon(window.start) ?? null,
          scheduleEnd: atUtcNoon(window.end) ?? null,
        },
      });
    }
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
    done?: boolean;
    title?: string;
    category?: string;
  }) {
    const label = input.title?.trim();
    const category = input.category?.trim();
    if (input.done === undefined && !label && !category) {
      throw new ValidationError("Provide done, title, or category");
    }

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

    const nextItems = items.map((item, i) => {
      if (i !== index) return item;
      return {
        ...item,
        ...(input.done !== undefined ? { done: input.done } : {}),
        ...(label ? { label } : {}),
        ...(category ? { category } : {}),
      };
    });

    const updated = await this.db.catalogChecklist.update({
      where: { id: checklist.id },
      data: { items: nextItems as Prisma.InputJsonValue },
    });

    await this.invalidateUserTrips(input.userId, input.tripId);
    return checklistApiPayload(updated);
  }

  /**
   * Create a user-owned custom checklist for the trip (optionally with a first item).
   */
  async createChecklist(input: {
    tripId: string;
    userId: string;
    title?: string;
    itemTitle?: string;
    category?: string;
  }) {
    const trip = await this.db.trip.findFirst({
      where: { id: input.tripId, userId: input.userId },
      select: { id: true },
    });
    if (!trip) throw new NotFoundError("Trip not found");

    const title = input.title?.trim() || "My checklist";
    const itemTitle = input.itemTitle?.trim();
    const items: StoredChecklistItem[] = [];
    if (itemTitle) {
      items.push(newUserChecklistItem(itemTitle, input.category));
    }

    const created = await this.db.catalogChecklist.create({
      data: {
        tripId: input.tripId,
        title,
        provider: "user",
        items: items as Prisma.InputJsonValue,
      },
    });

    await this.invalidateUserTrips(input.userId, input.tripId);
    return checklistApiPayload(created);
  }

  /**
   * Append a new custom checklist item inside `catalog_checklists.items` JSON.
   * If the trip does not have a checklist yet, one is created automatically.
   */
  async addChecklistItem(input: {
    tripId: string;
    userId: string;
    checklistId?: string;
    title: string;
    category?: string;
  }) {
    const title = input.title?.trim();
    if (!title) throw new ValidationError("Checklist item title is required");

    const trip = await this.db.trip.findFirst({
      where: { id: input.tripId, userId: input.userId },
      select: { id: true },
    });
    if (!trip) throw new NotFoundError("Trip not found");

    let checklist = input.checklistId
      ? await this.db.catalogChecklist.findFirst({
          where: { id: input.checklistId, tripId: input.tripId },
        })
      : await this.db.catalogChecklist.findFirst({
          where: { tripId: input.tripId },
          orderBy: { createdAt: "desc" },
        });

    if (input.checklistId && !checklist) {
      throw new NotFoundError("Checklist not found");
    }

    if (!checklist) {
      checklist = await this.db.catalogChecklist.create({
        data: {
          tripId: input.tripId,
          title: "My checklist",
          provider: "user",
          items: [],
        },
      });
    }

    const items = normalizeChecklistItems(checklist.items);
    const newItem = newUserChecklistItem(title, input.category);
    const updated = await this.db.catalogChecklist.update({
      where: { id: checklist.id },
      data: { items: [...items, newItem] as Prisma.InputJsonValue },
    });

    await this.invalidateUserTrips(input.userId, input.tripId);
    return { ...checklistApiPayload(updated), item: newItem };
  }

  async deleteChecklistItem(input: {
    tripId: string;
    userId: string;
    checklistId: string;
    itemId: string;
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
    if (!items.some((item) => item.id === input.itemId)) {
      throw new NotFoundError("Checklist item not found");
    }

    const updated = await this.db.catalogChecklist.update({
      where: { id: checklist.id },
      data: {
        items: items.filter((item) => item.id !== input.itemId) as Prisma.InputJsonValue,
      },
    });

    await this.invalidateUserTrips(input.userId, input.tripId);
    return checklistApiPayload(updated);
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
      const normalizeOptions = {
        tripOriginCity: trip.originCity,
        preferences: mergedPreferences,
      };
      // Draft-locked skeletons skip planSkeleton (and its normalize). Always
      // normalize here so originIata / airportIata exist — otherwise
      // search_flights is silently skipped and Bookings only shows hotels.
      const planned = input.skeleton
        ? { skeleton: input.skeleton, llm: this.planner.llmName }
        : await this.planner.planSkeleton(
            {
              prompt: input.prompt,
              preferences: mergedPreferences,
            },
            normalizeOptions,
            {
              tripId: input.tripId,
              userId: input.userId,
            },
          );
      const skeleton = input.skeleton
        ? normalizeTripSkeleton(planned.skeleton, normalizeOptions)
        : planned.skeleton;
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
  category?: string;
};

function newUserChecklistItem(label: string, category?: string): StoredChecklistItem {
  return {
    id: randomUUID(),
    label,
    done: false,
    source: "user",
    category: category?.trim() || "Essentials",
  };
}

function checklistApiPayload(row: {
  id: string;
  tripId: string;
  title: string;
  provider: string;
  items: unknown;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    tripId: row.tripId,
    title: row.title,
    provider: row.provider,
    items: normalizeChecklistItems(row.items),
    updatedAt: row.updatedAt.toISOString(),
  };
}

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
    const category =
      typeof row.category === "string" && row.category.trim().length > 0
        ? row.category.trim()
        : typeof row.section === "string" && row.section.trim().length > 0
          ? row.section.trim()
          : undefined;
    items.push({
      id,
      label,
      done: Boolean(row.done),
      source,
      ...(category ? { category } : {}),
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
      return "I couldn't turn that message into a draft. Try rephrasing it, or send it again in a moment.";
    case "VALIDATION_ERROR":
      return "I couldn't process that message. Add a clearer destination, dates, or a small change to the text.";
    case "PLAN_NEEDS_INPUT":
      return "A few details are still missing. Fill those in, then we can continue the draft.";
    default:
      break;
  }

  return "Something went wrong while writing a reply. Please send your message again.";
}

function dayOrUndefined(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function mergeRawLock(raw: unknown, isLocked: boolean | undefined): Record<string, unknown> {
  const base =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {};
  if (isLocked !== undefined) base.isLocked = isLocked;
  return base;
}

function rawLocked(raw: Record<string, unknown>): boolean {
  return raw.isLocked === true;
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
      return "hub";
    case "BOOKING":
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
    isLocked?: boolean | null;
    isCustom?: boolean | null;
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
    isLocked: Boolean(stop.isLocked),
    isCustom: Boolean(stop.isCustom),
  };
}
