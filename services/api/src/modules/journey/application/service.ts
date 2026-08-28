import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../../../infra/prisma/client.js";
import type { CacheStore } from "../../../shared/cache/index.js";
import { cacheKey, getOrSet } from "../../../shared/cache/index.js";
import { NotFoundError, ValidationError } from "../../../shared/http/errors.js";
import type { CostService } from "../../cost/service.js";
import type { ImageService } from "../../images/index.js";
import type { PolicyService } from "../../policy/service.js";
import type { PlannerService } from "../../planner/service.js";
import type { PlanSkeletonInput } from "../../planner/domain/skeleton.js";
import type { PlannerToolContext } from "../../../shared/mcp/index.js";
import { buildPlanNodeDrafts, parentPathOf, slugify, type PlannedNodeDraft } from "./persist-plan.js";

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
};

type JourneyDb = Pick<PrismaClient, "user" | "trip" | "pipelineNode" | "$transaction">;

export class JourneyService {
  private readonly cache?: CacheStore;
  private readonly ttlSeconds: number;
  private readonly planner?: PlannerService;
  private readonly cost?: CostService;
  private readonly policy?: PolicyService;
  private readonly images?: ImageService;

  constructor(
    private readonly db: JourneyDb = defaultPrisma,
    options: JourneyServiceOptions = {},
  ) {
    this.cache = options.cache;
    this.ttlSeconds = options.ttlSeconds ?? 60;
    this.planner = options.planner;
    this.cost = options.cost;
    this.policy = options.policy;
    this.images = options.images;
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
    return trip;
  }

  async listTrips(userId: string) {
    return getOrSet(
      {
        cache: this.cache,
        key: this.listKey(userId),
        ttlSeconds: this.ttlSeconds,
      },
      () =>
        this.db.trip.findMany({
          where: { userId },
          orderBy: { updatedAt: "desc" },
        }),
    );
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
        return trip;
      },
    );
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
        }),
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
    return node;
  }

  /**
   * Full plan flow: LLM skeleton → MCP tools → persist AI nodes → cost roll-up.
   */
  async planTrip(input: {
    tripId: string;
    userId: string;
    prompt: string;
    preferences?: PlanSkeletonInput["preferences"];
    context?: PlannerToolContext;
    executeTools?: boolean;
  }) {
    if (!this.planner) {
      throw new ValidationError("Planner is not configured");
    }

    const trip = await this.getTrip(input.tripId, input.userId);
    const root = trip.nodes.find((n) => n.parentId === null);
    if (!root) throw new ValidationError("Trip root node missing");

    await this.db.trip.update({
      where: { id: input.tripId },
      data: { status: "planning" },
    });

    try {
      const executeTools = input.executeTools !== false;
      const { skeleton, llm } = await this.planner.planSkeleton({
        prompt: input.prompt,
        preferences: input.preferences,
      });

      const context: PlannerToolContext = {
        adults: input.preferences?.partySize ?? trip.partySize,
        passportCountry: input.preferences?.passportCountry,
        checkIn:
          input.context?.checkIn ??
          input.preferences?.startDate ??
          skeleton.assumedStartDate,
        checkOut:
          input.context?.checkOut ??
          input.preferences?.endDate ??
          skeleton.assumedEndDate,
        departureDate:
          input.context?.departureDate ??
          input.preferences?.startDate ??
          skeleton.assumedStartDate,
        returnDate:
          input.context?.returnDate ??
          input.preferences?.endDate ??
          skeleton.assumedEndDate,
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

      const drafts = await this.enrichCheckpointImages(buildPlanNodeDrafts(skeleton, execution));
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
          startDate: skeleton.assumedStartDate
            ? new Date(skeleton.assumedStartDate)
            : trip.startDate,
          endDate: skeleton.assumedEndDate ? new Date(skeleton.assumedEndDate) : trip.endDate,
          partySize: skeleton.partySize ?? trip.partySize,
          planningVersion: { increment: 1 },
          lastPlannedAt: new Date(),
        },
      });

      await this.invalidateUserTrips(input.userId, input.tripId);
      const updated = await this.getTrip(input.tripId, input.userId);

      return {
        trip: updated,
        llm,
        mcp: execution.mcp,
        skeleton,
        execution,
      };
    } catch (err) {
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
      where: { tripId: input.tripId, deletedAt: null },
      select: {
        id: true,
        parentId: true,
        type: true,
        origin: true,
        isLocked: true,
        isCustom: true,
        suppressAiRestore: true,
        deletedAt: true,
      },
    });

    const now = new Date();
    for (const node of existing) {
      if (node.type === "JOURNEY" || node.parentId === null) continue;
      if (node.origin !== "ai") continue;
      const canMutate = this.policy
        ? this.policy.canAiMutate(node)
        : !node.isLocked && !node.isCustom && !node.suppressAiRestore;
      if (!canMutate) continue;
      await this.db.pipelineNode.update({
        where: { id: node.id },
        data: { deletedAt: now },
      });
    }

    const pathToId = new Map<string, string>([[input.rootPath, input.rootId]]);
    const sortByParent = new Map<string, number>();

    for (const draft of input.drafts) {
      const parentPath = parentPathOf(draft.path);
      const parentId = pathToId.get(parentPath);
      if (!parentId) {
        throw new ValidationError(`Missing parent path ${parentPath}`);
      }
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

  private listKey(userId: string) {
    return cacheKey("trips:list", { userId });
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
