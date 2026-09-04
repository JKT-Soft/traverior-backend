import { Prisma, type PrismaClient, type SavedPlace } from "@prisma/client";
import { prisma as defaultPrisma } from "../../../infra/prisma/client.js";
import { NotFoundError, ValidationError } from "../../../shared/http/errors.js";

export const SAVED_PLACE_SOURCES = ["user", "google", "node", "checkpoint"] as const;
export type SavedPlaceSource = (typeof SAVED_PLACE_SOURCES)[number];

export type SavePlaceInput = {
  name?: string;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  lat?: number | null;
  lng?: number | null;
  source?: SavedPlaceSource;
  provider?: string | null;
  providerRef?: string | null;
  tripId?: string | null;
  nodeId?: string | null;
  notes?: string | null;
  extra?: Record<string, unknown> | null;
};

export type UpdateSavedPlaceInput = {
  name?: string;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  lat?: number | null;
  lng?: number | null;
  notes?: string | null;
  extra?: Record<string, unknown> | null;
};

export type ListSavedPlacesQuery = {
  city?: string;
  nodeId?: string;
  providerRef?: string;
};

type SavedPlaceDb = Pick<PrismaClient, "user" | "savedPlace" | "pipelineNode">;

function jsonField(value: Record<string, unknown> | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

function roundCoord(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 1e5) / 1e5;
}

function trimToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function stringFromUnknown(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isUniqueViolation(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function cityFromNode(node: {
  locationLabel: string | null;
  content: Prisma.JsonValue | null;
}): string | undefined {
  const label = trimToNull(node.locationLabel);
  if (label) return label;
  if (node.content && typeof node.content === "object" && !Array.isArray(node.content)) {
    const content = node.content as Record<string, unknown>;
    return stringFromUnknown(content.city) ?? stringFromUnknown(content.locality);
  }
  return undefined;
}

export function serializeSavedPlace(place: SavedPlace) {
  return {
    id: place.id,
    name: place.name,
    address: place.address,
    city: place.city,
    country: place.country,
    lat: place.lat,
    lng: place.lng,
    source: place.source,
    provider: place.provider,
    providerRef: place.providerRef,
    tripId: place.tripId,
    nodeId: place.nodeId,
    notes: place.notes,
    extra: place.extra,
    createdAt: place.createdAt.toISOString(),
    updatedAt: place.updatedAt.toISOString(),
  };
}

export class SavedPlaceService {
  constructor(private readonly db: SavedPlaceDb = defaultPrisma) {}

  async ensureUser(firebaseUid: string, email: string) {
    return this.db.user.upsert({
      where: { firebaseUid },
      update: { email },
      create: { firebaseUid, email },
    });
  }

  async listPlaces(userId: string, query: ListSavedPlacesQuery = {}) {
    const places = await this.db.savedPlace.findMany({
      where: {
        userId,
        ...(query.city ? { city: query.city } : {}),
        ...(query.nodeId ? { nodeId: query.nodeId } : {}),
        ...(query.providerRef ? { providerRef: query.providerRef } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    return places.map(serializeSavedPlace);
  }

  async getPlace(userId: string, id: string) {
    const place = await this.db.savedPlace.findFirst({ where: { id, userId } });
    if (!place) throw new NotFoundError("Saved place not found");
    return serializeSavedPlace(place);
  }

  async savePlace(userId: string, input: SavePlaceInput) {
    const hydrated = input.nodeId ? await this.hydrateFromNode(userId, input) : input;
    const data = this.toCreateData(userId, hydrated);

    const existing = await this.findDuplicate(userId, data);
    if (existing) {
      return { place: serializeSavedPlace(existing), created: false };
    }

    try {
      const created = await this.db.savedPlace.create({ data });
      return { place: serializeSavedPlace(created), created: true };
    } catch (err) {
      if (isUniqueViolation(err)) {
        const again = await this.findDuplicate(userId, data);
        if (again) return { place: serializeSavedPlace(again), created: false };
      }
      throw err;
    }
  }

  async updatePlace(userId: string, id: string, input: UpdateSavedPlaceInput) {
    await this.getPlace(userId, id);

    const data: Prisma.SavedPlaceUpdateInput = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.address !== undefined) data.address = trimToNull(input.address);
    if (input.city !== undefined) data.city = trimToNull(input.city);
    if (input.country !== undefined) data.country = trimToNull(input.country);
    if (input.lat !== undefined) data.lat = roundCoord(input.lat);
    if (input.lng !== undefined) data.lng = roundCoord(input.lng);
    if (input.notes !== undefined) data.notes = trimToNull(input.notes);
    if (input.extra !== undefined) data.extra = jsonField(input.extra);

    const updated = await this.db.savedPlace.update({
      where: { id },
      data,
    });
    return serializeSavedPlace(updated);
  }

  async deletePlace(userId: string, id: string) {
    await this.getPlace(userId, id);
    await this.db.savedPlace.delete({ where: { id } });
    return { deleted: true };
  }

  private async hydrateFromNode(userId: string, input: SavePlaceInput): Promise<SavePlaceInput> {
    const node = await this.db.pipelineNode.findFirst({
      where: { id: input.nodeId!, deletedAt: null, trip: { userId } },
    });
    if (!node) throw new NotFoundError("Place not found");

    return {
      name: input.name?.trim() || node.title,
      address: input.address !== undefined ? input.address : (node.subtitle ?? node.locationLabel),
      city: input.city !== undefined ? input.city : cityFromNode(node),
      country: input.country,
      lat: input.lat !== undefined ? input.lat : node.locationLat,
      lng: input.lng !== undefined ? input.lng : node.locationLng,
      source: input.source ?? "node",
      provider: input.provider !== undefined ? input.provider : (node.provider ?? "pipeline"),
      providerRef: input.providerRef !== undefined ? input.providerRef : (node.providerRef ?? node.id),
      tripId: input.tripId !== undefined ? input.tripId : node.tripId,
      nodeId: node.id,
      notes: input.notes,
      extra: input.extra,
    };
  }

  private toCreateData(userId: string, input: SavePlaceInput): Prisma.SavedPlaceUncheckedCreateInput {
    const name = input.name?.trim();
    if (!name) throw new ValidationError("Name is required");

    const lat = roundCoord(input.lat);
    const lng = roundCoord(input.lng);
    if ((lat == null) !== (lng == null)) {
      throw new ValidationError("Both lat and lng are required together");
    }

    return {
      userId,
      name,
      address: trimToNull(input.address),
      city: trimToNull(input.city),
      country: trimToNull(input.country),
      lat,
      lng,
      source: input.source ?? (input.nodeId ? "node" : input.provider === "google" ? "google" : "user"),
      provider: trimToNull(input.provider),
      providerRef: trimToNull(input.providerRef),
      tripId: input.tripId ?? null,
      nodeId: input.nodeId ?? null,
      notes: trimToNull(input.notes),
      extra: jsonField(input.extra) ?? undefined,
    };
  }

  private findDuplicate(userId: string, data: Prisma.SavedPlaceUncheckedCreateInput) {
    const where: Prisma.SavedPlaceWhereInput = { userId };
    if (data.provider && data.providerRef) {
      where.provider = data.provider;
      where.providerRef = data.providerRef;
    } else if (data.nodeId) {
      where.nodeId = data.nodeId;
    } else if (data.lat != null && data.lng != null) {
      where.name = data.name;
      where.lat = data.lat;
      where.lng = data.lng;
    } else {
      where.name = data.name;
      where.city = data.city ?? null;
      where.address = data.address ?? null;
    }
    return this.db.savedPlace.findFirst({ where });
  }
}
