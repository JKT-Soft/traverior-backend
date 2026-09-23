import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../../../infra/prisma/client.js";
import type { CacheStore } from "../../../shared/cache/index.js";
import { cacheKey, getOrSet } from "../../../shared/cache/index.js";
import { NotFoundError, PlanNeedsInputError, ValidationError } from "../../../shared/http/errors.js";
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
import type { PlanSkeletonInput } from "../../planner/domain/skeleton.js";
import type { PlannerToolContext } from "../../../shared/mcp/index.js";
import { coverImageUrlFromNodes, coverLocationFromTrip } from "./cover-image.js";
import { serializeTrip, serializeTripNode } from "./serialize-trip.js";
import { serializePlanResponse } from "./serialize-plan-response.js";
import { mergePlanPreferences, type StoredTravelPreference } from "./merge-plan-preferences.js";
import { buildPlanNodeDrafts, parentPathOf, slugify, type PlannedNodeDraft } from "./persist-plan.js";
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

type JourneyDb = Pick<PrismaClient, "user" | "trip" | "pipelineNode" | "$transaction"> &
  ApplicationLogDb;

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

      const root = await tx.pipelineNode.create({
        data: {
          tripId: created.id,
          parentId: null,
          depth: 0,
          path: "trip",
          sortOrder: 0,
          type: "JOURNEY",
          title: input.title,
          origin: "user",
        },
      });

      return tx.trip.update({
        where: { id: created.id },
        data: { rootNodeId: root.id },
        include: { nodes: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } } },
      });
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
          include: {
            nodes: {
              where: { deletedAt: null, type: "CHECKPOINT" },
              orderBy: { sortOrder: "asc" },
            },
          },
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
          include: {
            nodes: {
              where: { deletedAt: null },
              orderBy: [{ depth: "asc" }, { sortOrder: "asc" }],
            },
          },
        });
        if (!trip) throw new NotFoundError("Trip not found");
        return serializeTrip(trip);
      },
    ).then((trip) => this.withCoverImage(trip));
  }

  /** Public trip/plan payload: stops + catalog (no flat nodes[]). */
  async getTripPlan(tripId: string, userId: string) {
    const trip = await this.getTrip(tripId, userId);
    return serializePlanResponse({ trip });
  }

  async listChildren(tripId: string, userId: string, parentId: string | null) {
    await this.getTrip(tripId, userId);
    return getOrSet(
      {
        cache: this.cache,
        key: this.childrenKey(tripId, userId, parentId),
        ttlSeconds: this.ttlSeconds,
      },
      () =>
        this.db.pipelineNode.findMany({
          where: {
            tripId,
            parentId,
            deletedAt: null,
          },
          orderBy: { sortOrder: "asc" },
        }).then((nodes) => nodes.map(serializeTripNode)),
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
    const parent = trip.nodes.find((n) => n.id === input.parentId);
    if (!parent) throw new ValidationError("parentId not found in trip");

    const siblings = trip.nodes.filter((n) => n.parentId === input.parentId);
    const sortOrder = siblings.length;

    const node = await this.db.pipelineNode.create({
      data: {
        tripId: input.tripId,
        parentId: input.parentId,
        depth: parent.depth + 1,
        path: `${parent.path}/${slugify(input.title)}`,
        sortOrder,
        type: input.type,
        title: input.title,
        contentType: input.contentType,
        content: input.content,
        costAmount: input.costAmount ?? 0,
        costCurrency: input.costCurrency ?? trip.baseCurrency,
        durationMinutes: input.durationMinutes ?? 0,
        deepLinkUrl: input.deepLinkUrl,
        provider: input.provider,
        providerRef: input.providerRef,
        origin: input.origin ?? "user",
        isCustom: input.isCustom ?? true,
      },
    });

    await this.invalidateUserTrips(input.userId, input.tripId, input.parentId);
    return serializeTripNode(node);
  }

  /**
   * Full plan flow: LLM skeleton → MCP tools → persist AI nodes → cost roll-up.
   */
  async planTrip(input: {
    tripId: string;
    userId: string;
    prompt: string;
    preferences?: PlanSkeletonInput["preferences"];
    answers?: Record<string, unknown>;
    context?: PlannerToolContext;
    executeTools?: boolean;
  }) {
    if (!this.planner) {
      throw new ValidationError("Planner is not configured");
    }

    const trip = await this.getTrip(input.tripId, input.userId);
    const root = trip.nodes.find((n) => n.parentId === null);
    if (!root) throw new ValidationError("Trip root node missing");

    const storedPreference = await this.readStoredPreference(input.userId);
    const preferences = applyPlanAnswers(
      mergePlanPreferences({
        stored: storedPreference,
        request: input.preferences,
        tripOriginCity: trip.originCity,
      }),
      input.answers,
    );
    const slots = await this.planner.extractPlanSlots({
      prompt: input.prompt,
      preferences,
    });
    const mergedPreferences = mergeExtractedPreferences(preferences, slots.extracted);
    const missing = ensureCriticalClarifications(
      filterResolvedClarifications(slots.missing, mergedPreferences, input.answers),
      mergedPreferences,
    );
    const { required, recommended } = splitClarifications(missing);
    if (required.length > 0) {
      throw new PlanNeedsInputError(required, {
        extracted: publicExtractedSlots(mergedPreferences),
      });
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
      const { skeleton, llm } = await this.planner.planSkeleton(
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
      await planLog?.progress({
        message: "LLM skeleton generated",
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

      // Prefer explicit user dates; do not invent a trip from skeleton assumptions alone.
      if (!hasConcreteTravelDates(mergedPreferences, input.answers) || !dates.start) {
        throw new PlanNeedsInputError([requiredTravelDateClarification()], {
          extracted: publicExtractedSlots(mergedPreferences),
        });
      }

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

      const drafts = await this.enrichCheckpointImages(
        buildPlanNodeDrafts(skeleton, execution, {
          originCity: skeleton.originCity,
          returnCity: skeleton.originCity,
          startDate: dates.start,
          endDate: dates.end,
        }),
      );
      await this.replaceAiPlanNodes({
        tripId: input.tripId,
        rootId: root.id,
        rootPath: root.path,
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

  private async enrichCheckpointImages(drafts: PlannedNodeDraft[]): Promise<PlannedNodeDraft[]> {
    if (!this.images) return drafts;

    return Promise.all(
      drafts.map(async (draft) => {
        if (draft.type !== "CHECKPOINT" || !draft.content || typeof draft.content !== "object") {
          return draft;
        }
        const content = draft.content as Record<string, unknown>;
        const city = typeof content.city === "string" ? content.city : draft.title;
        if (!city) return draft;

        try {
          const images = await this.images!.searchByLocation(city, { perPage: 1 });
          const image = images[0];
          if (!image) return draft;
          return {
            ...draft,
            content: {
              ...content,
              thumbnailUrl: image.thumbUrl || image.imageUrl,
              imageUrl: image.imageUrl,
              imageAttribution: {
                photographerName: image.photographerName,
                photographerUrl: image.photographerUrl,
                unsplashUrl: image.unsplashUrl,
                provider: image.provider,
                photoId: image.photoId,
              },
            },
          };
        } catch (err) {
          console.warn("[traverior-api:images] checkpoint enrich failed", {
            city,
            err: String(err),
          });
          return draft;
        }
      }),
    );
  }

  private async replaceAiPlanNodes(input: {
    tripId: string;
    rootId: string;
    rootPath: string;
    baseCurrency: string;
    drafts: PlannedNodeDraft[];
  }) {
    const existing = await this.db.pipelineNode.findMany({
      where: {
        tripId: input.tripId,
        OR: [{ deletedAt: null }, { suppressAiRestore: true }],
      },
      select: {
        id: true,
        parentId: true,
        path: true,
        type: true,
        origin: true,
        sortOrder: true,
        isLocked: true,
        isCustom: true,
        suppressAiRestore: true,
        deletedAt: true,
      },
    });

    const { replaceable, preserved } = this.policy.planReplacement(existing);
    const now = new Date();
    for (const node of replaceable) {
      await this.db.pipelineNode.update({
        where: { id: node.id },
        data: { deletedAt: now },
      });
    }

    const pathToId = new Map<string, string>([[input.rootPath, input.rootId]]);
    const sortByParent = new Map<string, number>();
    for (const node of existing) {
      if (node.deletedAt || !node.path) continue;
      if (replaceable.some((item) => item.id === node.id)) continue;
      pathToId.set(node.path, node.id);
      const parentPath = parentPathOf(node.path);
      const next = (sortByParent.get(parentPath) ?? 0);
      sortByParent.set(parentPath, Math.max(next, node.sortOrder + 1));
    }

    const drafts = this.policy.filterDrafts(input.drafts, preserved);

    for (const draft of drafts) {
      const parentPath = parentPathOf(draft.path);
      const parentId = pathToId.get(parentPath);
      if (!parentId) {
        throw new ValidationError(`Missing parent path ${parentPath}`);
      }
      if (pathToId.has(draft.path)) continue;

      const depth = draft.path.split("/").filter(Boolean).length - 1;
      const sortOrder = sortByParent.get(parentPath) ?? 0;
      sortByParent.set(parentPath, sortOrder + 1);

      const created = await this.db.pipelineNode.create({
        data: {
          tripId: input.tripId,
          parentId,
          depth,
          path: draft.path,
          sortOrder,
          type: draft.type,
          checkpointKind: draft.checkpointKind,
          title: draft.title,
          subtitle: draft.subtitle,
          contentType: draft.contentType,
          content: draft.content,
          costAmount: draft.costAmount ?? 0,
          costCurrency: draft.costCurrency ?? input.baseCurrency,
          costIsEstimate: true,
          durationMinutes: draft.durationMinutes ?? 0,
          scheduleStart: draft.scheduleStart,
          scheduleEnd: draft.scheduleEnd,
          deepLinkUrl: draft.deepLinkUrl,
          provider: draft.provider,
          providerRef: draft.providerRef,
          origin: "ai",
          isCustom: false,
          lastRefreshedAt: now,
        },
      });
      pathToId.set(draft.path, created.id);
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
      extra: preference.extra,
    };
  }

  private async withCoverImage<T extends {
    title: string;
    destinationSummary?: string | null;
    nodes?: Array<{
      type?: string;
      checkpointKind?: string | null;
      title?: string;
      content?: unknown;
    }>;
  }>(trip: T) {
    const fromNodes = coverImageUrlFromNodes(trip.nodes);
    if (fromNodes) return { ...trip, coverImageUrl: fromNodes };

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
    return cacheKey("trips:list", { userId, v: 2 });
  }

  private tripKey(tripId: string, userId: string) {
    return cacheKey("trips:get", { tripId, userId });
  }

  private childrenKey(tripId: string, userId: string, parentId: string | null) {
    return cacheKey("trips:children", { tripId, userId, parentId });
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
