import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../../../infra/prisma/client.js";
import { NotFoundError, ValidationError } from "../../../shared/http/errors.js";

export type CreateTripInput = {
  userId: string;
  title: string;
  originCity?: string;
  destinationSummary?: string;
  startDate?: string;
  endDate?: string;
  partySize?: number;
};

type JourneyDb = Pick<PrismaClient, "user" | "trip" | "pipelineNode" | "$transaction">;

export class JourneyService {
  constructor(private readonly db: JourneyDb = defaultPrisma) {}

  async ensureUser(firebaseUid: string, email: string) {
    return this.db.user.upsert({
      where: { firebaseUid },
      update: { email },
      create: { firebaseUid, email },
    });
  }

  async createTrip(input: CreateTripInput) {
    return this.db.$transaction(async (tx: Prisma.TransactionClient) => {
      const trip = await tx.trip.create({
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
          tripId: trip.id,
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
        where: { id: trip.id },
        data: { rootNodeId: root.id },
        include: { nodes: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" } } },
      });
    });
  }

  async listTrips(userId: string) {
    return this.db.trip.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });
  }

  async getTrip(tripId: string, userId: string) {
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
  }

  async listChildren(tripId: string, userId: string, parentId: string | null) {
    await this.getTrip(tripId, userId);
    return this.db.pipelineNode.findMany({
      where: {
        tripId,
        parentId,
        deletedAt: null,
      },
      orderBy: { sortOrder: "asc" },
    });
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

    return this.db.pipelineNode.create({
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
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "node";
}
