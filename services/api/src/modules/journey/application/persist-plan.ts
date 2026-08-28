import type { CheckpointKind, NodeType, Prisma } from "@prisma/client";
import type { CheckpointToolResults } from "../../planner/service.js";
import type { SkeletonCheckpoint, TripSkeleton } from "../../planner/domain/skeleton.js";
import type { McpToolResult } from "../../../shared/mcp/index.js";

export type PlannedNodeDraft = {
  /** Explicit node path (parentPath is derived as dirname). */
  path: string;
  type: NodeType;
  checkpointKind?: CheckpointKind;
  title: string;
  subtitle?: string;
  contentType?: string;
  content?: Prisma.InputJsonValue;
  costAmount?: number;
  costCurrency?: string;
  durationMinutes?: number;
  deepLinkUrl?: string;
  provider?: string;
  providerRef?: string;
  origin: "ai";
  isCustom: false;
};

function parentPathOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "trip" : path.slice(0, idx);
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "node"
  );
}

function roleToCheckpointKind(role: SkeletonCheckpoint["role"]): CheckpointKind {
  switch (role) {
    case "TRANSIT":
      return "TRANSIT";
    case "DAY_TRIP":
      return "DAY_TRIP";
    default:
      return "STAY";
  }
}

function moneyFromUnknown(value: unknown): { amount: number; currency: string } | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { amount?: unknown; currency?: unknown };
  const amount = typeof row.amount === "number" ? row.amount : Number(row.amount);
  if (!Number.isFinite(amount)) return null;
  return {
    amount,
    currency: typeof row.currency === "string" ? row.currency : "IDR",
  };
}

function firstArrayItem(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : undefined;
}

function toolToNodeDraft(
  parentPath: string,
  result: McpToolResult,
  childSlug: string,
): PlannedNodeDraft | null {
  if (!result.ok || !result.data || typeof result.data !== "object") return null;
  const data = result.data as Record<string, unknown>;
  const provider = typeof data.provider === "string" ? data.provider : undefined;
  const path = `${parentPath}/${childSlug}`;

  switch (result.tool) {
    case "search_flights": {
      const offer = firstArrayItem(data.offers) as
        | {
            id?: string;
            carrier?: string;
            flightNumber?: string;
            durationMinutes?: number;
            price?: unknown;
            deepLink?: string;
          }
        | undefined;
      if (!offer) {
        return {
          path,
          type: "MODULE",
          title: "Flights",
          contentType: "flights.search",
          content: data as Prisma.InputJsonValue,
          provider,
          origin: "ai",
          isCustom: false,
        };
      }
      const money = moneyFromUnknown(offer.price);
      return {
        path,
        type: "BOOKING",
        title: [offer.carrier, offer.flightNumber].filter(Boolean).join(" ") || "Flight",
        contentType: "flight",
        content: offer as Prisma.InputJsonValue,
        costAmount: money?.amount,
        costCurrency: money?.currency,
        durationMinutes: typeof offer.durationMinutes === "number" ? offer.durationMinutes : 0,
        deepLinkUrl: typeof offer.deepLink === "string" ? offer.deepLink : undefined,
        provider,
        providerRef: typeof offer.id === "string" ? offer.id : undefined,
        origin: "ai",
        isCustom: false,
      };
    }
    case "search_hotels": {
      const hotel = firstArrayItem(data.hotels) as
        | {
            hotelId?: string;
            name?: string;
            price?: unknown;
            deepLink?: string;
          }
        | undefined;
      if (!hotel) {
        return {
          path,
          type: "MODULE",
          title: "Hotels",
          contentType: "hotels.search",
          content: data as Prisma.InputJsonValue,
          provider,
          origin: "ai",
          isCustom: false,
        };
      }
      const money = moneyFromUnknown(hotel.price);
      return {
        path,
        type: "BOOKING",
        title: hotel.name ?? "Hotel",
        contentType: "hotel",
        content: hotel as Prisma.InputJsonValue,
        costAmount: money?.amount,
        costCurrency: money?.currency,
        deepLinkUrl: typeof hotel.deepLink === "string" ? hotel.deepLink : undefined,
        provider,
        providerRef: typeof hotel.hotelId === "string" ? hotel.hotelId : undefined,
        origin: "ai",
        isCustom: false,
      };
    }
    case "search_restaurants":
      return {
        path,
        type: "MODULE",
        title: "Restaurants",
        contentType: "places.restaurants",
        content: data as Prisma.InputJsonValue,
        provider,
        origin: "ai",
        isCustom: false,
      };
    case "search_pois":
      return {
        path,
        type: "MODULE",
        title: "Points of interest",
        contentType: "places.pois",
        content: data as Prisma.InputJsonValue,
        provider,
        origin: "ai",
        isCustom: false,
      };
    case "get_route": {
      const route = data.route as { durationMinutes?: number; distanceMeters?: number } | undefined;
      return {
        path,
        type: "LEG",
        title: "Route",
        contentType: "route",
        content: data as Prisma.InputJsonValue,
        durationMinutes: typeof route?.durationMinutes === "number" ? route.durationMinutes : 0,
        provider,
        origin: "ai",
        isCustom: false,
      };
    }
    case "get_forecast":
      return {
        path,
        type: "LEAF",
        title: "Weather forecast",
        contentType: "weather.forecast",
        content: data as Prisma.InputJsonValue,
        provider,
        origin: "ai",
        isCustom: false,
      };
    case "search_events": {
      const event = firstArrayItem(data.events) as
        | { title?: string; name?: string; price?: unknown; id?: string; deepLink?: string }
        | undefined;
      const money = moneyFromUnknown(event?.price);
      return {
        path,
        type: event ? "ACTIVITY" : "MODULE",
        title: event?.title ?? event?.name ?? "Events",
        contentType: event ? "event" : "events.search",
        content: (event ?? data) as Prisma.InputJsonValue,
        costAmount: money?.amount,
        costCurrency: money?.currency,
        deepLinkUrl: typeof event?.deepLink === "string" ? event.deepLink : undefined,
        provider,
        providerRef: typeof event?.id === "string" ? event.id : undefined,
        origin: "ai",
        isCustom: false,
      };
    }
    case "get_visa_requirements":
      return {
        path,
        type: "LEAF",
        title: "Visa requirements",
        contentType: "visa.requirements",
        content: data as Prisma.InputJsonValue,
        provider,
        origin: "ai",
        isCustom: false,
      };
    case "generate_checklist":
      return {
        path,
        type: "MODULE",
        title: "Checklist",
        contentType: "checklist",
        content: data as Prisma.InputJsonValue,
        provider,
        origin: "ai",
        isCustom: false,
      };
    default:
      return {
        path,
        type: "LEAF",
        title: result.tool,
        contentType: `mcp.${result.tool}`,
        content: data as Prisma.InputJsonValue,
        provider,
        origin: "ai",
        isCustom: false,
      };
  }
}

/** Flatten skeleton + MCP results into ordered node drafts (parent before children). */
export function buildPlanNodeDrafts(
  skeleton: TripSkeleton,
  execution: { checkpoints: CheckpointToolResults[] },
): PlannedNodeDraft[] {
  const drafts: PlannedNodeDraft[] = [];
  const usedSlugs = new Set<string>();

  skeleton.checkpoints.forEach((checkpoint, index) => {
    let slug = slugify(checkpoint.city);
    if (usedSlugs.has(slug)) slug = `${slug}-${index + 1}`;
    usedSlugs.add(slug);
    const checkpointPath = `trip/${slug}`;

    drafts.push({
      path: checkpointPath,
      type: "CHECKPOINT",
      checkpointKind: roleToCheckpointKind(checkpoint.role),
      title: checkpoint.city,
      subtitle: checkpoint.notes ?? `${checkpoint.days} day(s)`,
      contentType: "checkpoint",
      content: {
        city: checkpoint.city,
        countryCode: checkpoint.countryCode,
        role: checkpoint.role,
        days: checkpoint.days,
        needs: checkpoint.needs,
        notes: checkpoint.notes,
      },
      durationMinutes: checkpoint.days * 24 * 60,
      origin: "ai",
      isCustom: false,
    });

    const exec = execution.checkpoints[index];
    const results = exec?.results ?? [];
    results.forEach((result, toolIndex) => {
      const child = toolToNodeDraft(checkpointPath, result, `${slugify(result.tool)}-${toolIndex + 1}`);
      if (child) drafts.push(child);
    });
  });

  return drafts;
}

export { parentPathOf, slugify };
