import type { CheckpointKind, NodeType, Prisma } from "@prisma/client";
import type { CheckpointToolResults } from "../../planner/service.js";
import {
  addDaysIso,
  allocateCheckpointWindows,
  atUtcNoon,
  hotelCheckOutIso,
  type CheckpointScheduleWindow,
} from "../../planner/domain/checkpoint-schedule.js";
import { DEFAULT_ORIGIN_CITY } from "../../planner/domain/normalize-skeleton.js";
import type { SkeletonCheckpoint, TripSkeleton } from "../../planner/domain/skeleton.js";
import type { McpToolResult } from "../../../shared/mcp/index.js";

export type BuildPlanNodeDraftsOptions = {
  originCity?: string;
  returnCity?: string;
  startDate?: string;
  endDate?: string;
};

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
  scheduleStart?: Date;
  scheduleEnd?: Date;
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

function citiesEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function uniqueSlug(base: string, used: Set<string>, fallback: string): string {
  let slug = slugify(base);
  if (!used.has(slug)) {
    used.add(slug);
    return slug;
  }
  let index = 2;
  while (used.has(`${slug}-${index}`)) index += 1;
  slug = `${slug}-${index}`;
  used.add(slug);
  return slug;
}

function hubCheckpointDraft(
  path: string,
  city: string,
  kind: "ORIGIN" | "RETURN",
  scheduleIso?: string,
): PlannedNodeDraft {
  const at = atUtcNoon(scheduleIso);
  return {
    path,
    type: "CHECKPOINT",
    checkpointKind: kind,
    title: kind === "RETURN" ? `Return to ${city}` : city,
    subtitle: kind === "ORIGIN" ? "Departure" : "Return",
    contentType: "checkpoint",
    content: {
      city,
      role: kind,
      hub: true,
    },
    scheduleStart: at,
    scheduleEnd: at,
    origin: "ai",
    isCustom: false,
  };
}

function legDraft(
  path: string,
  title: string,
  subtitle: string,
  scheduleIso?: string,
): PlannedNodeDraft {
  const at = atUtcNoon(scheduleIso);
  return {
    path,
    type: "LEG",
    title,
    subtitle,
    contentType: "leg",
    scheduleStart: at,
    scheduleEnd: at,
    origin: "ai",
    isCustom: false,
  };
}

function withChildSchedule(
  child: PlannedNodeDraft,
  window: CheckpointScheduleWindow | null,
  toolIndex: number,
): PlannedNodeDraft {
  if (!window) return child;
  const checkOut = hotelCheckOutIso(window);
  if (child.contentType === "hotel" || (child.type === "BOOKING" && child.contentType === "hotel")) {
    const content =
      child.content && typeof child.content === "object" && !Array.isArray(child.content)
        ? { ...(child.content as Record<string, unknown>), checkIn: window.start, checkOut }
        : child.content;
    return {
      ...child,
      content: content as Prisma.InputJsonValue,
      scheduleStart: atUtcNoon(window.start),
      scheduleEnd: atUtcNoon(checkOut),
    };
  }
  if (child.contentType === "flight") {
    return {
      ...child,
      scheduleStart: atUtcNoon(window.start),
      scheduleEnd: atUtcNoon(window.start),
    };
  }
  const dayOffset = window.days <= 1 ? 0 : toolIndex % window.days;
  const day = addDaysIso(window.start, dayOffset);
  return {
    ...child,
    scheduleStart: atUtcNoon(day),
    scheduleEnd: atUtcNoon(day),
  };
}

/** Flatten skeleton + MCP results into ordered node drafts (parent before children). */
export function buildPlanNodeDrafts(
  skeleton: TripSkeleton,
  execution: { checkpoints: CheckpointToolResults[] },
  options: BuildPlanNodeDraftsOptions = {},
): PlannedNodeDraft[] {
  const drafts: PlannedNodeDraft[] = [];
  const usedSlugs = new Set<string>();
  const originCity = options.originCity ?? skeleton.originCity ?? DEFAULT_ORIGIN_CITY;
  const returnCity = options.returnCity ?? originCity;
  const destinations = skeleton.checkpoints;
  const windows = allocateCheckpointWindows(destinations, {
    start: options.startDate,
    end: options.endDate,
  });
  const firstWindow = windows.find((window) => window != null) ?? null;
  const lastWindow = [...windows].reverse().find((window) => window != null) ?? null;

  if (originCity && destinations.length > 0) {
    const originSlug = uniqueSlug(`${originCity}-origin`, usedSlugs, "origin");
    drafts.push(hubCheckpointDraft(`trip/${originSlug}`, originCity, "ORIGIN", options.startDate));

    const firstDestination = destinations[0]!;
    if (!citiesEqual(firstDestination.city, originCity)) {
      const legSlug = uniqueSlug(`leg-to-${firstDestination.city}`, usedSlugs, "leg-outbound");
      drafts.push(
        legDraft(
          `trip/${legSlug}`,
          `Flight to ${firstDestination.city}`,
          `From ${originCity}`,
          firstWindow?.start ?? options.startDate,
        ),
      );
    }
  }

  destinations.forEach((checkpoint, index) => {
    let slug = slugify(checkpoint.city);
    if (usedSlugs.has(slug)) slug = `${slug}-${index + 1}`;
    usedSlugs.add(slug);
    const checkpointPath = `trip/${slug}`;
    const window = windows[index] ?? null;
    const stayDays = window?.days ?? checkpoint.days;

    drafts.push({
      path: checkpointPath,
      type: "CHECKPOINT",
      checkpointKind: roleToCheckpointKind(checkpoint.role),
      title: checkpoint.city,
      subtitle: checkpoint.notes ?? `${stayDays} day(s)`,
      contentType: "checkpoint",
      content: {
        city: checkpoint.city,
        countryCode: checkpoint.countryCode,
        role: checkpoint.role,
        days: stayDays,
        startDate: window?.start,
        endDate: window?.end,
        needs: checkpoint.needs,
        notes: checkpoint.notes,
      },
      durationMinutes: stayDays * 24 * 60,
      scheduleStart: atUtcNoon(window?.start),
      scheduleEnd: atUtcNoon(window?.end),
      origin: "ai",
      isCustom: false,
    });

    const exec = execution.checkpoints[index];
    const results = exec?.results ?? [];
    results.forEach((result, toolIndex) => {
      const child = toolToNodeDraft(checkpointPath, result, `${slugify(result.tool)}-${toolIndex + 1}`);
      if (child) drafts.push(withChildSchedule(child, window, toolIndex));
    });
  });

  if (returnCity && destinations.length > 0) {
    const lastDestination = destinations[destinations.length - 1]!;
    if (!citiesEqual(lastDestination.city, returnCity)) {
      const legSlug = uniqueSlug(`leg-return-${returnCity}`, usedSlugs, "leg-return");
      drafts.push(
        legDraft(
          `trip/${legSlug}`,
          `Return to ${returnCity}`,
          `From ${lastDestination.city}`,
          lastWindow?.end ?? options.endDate,
        ),
      );
    }

    const returnSlug = uniqueSlug(`${returnCity}-return`, usedSlugs, "return");
    drafts.push(
      hubCheckpointDraft(
        `trip/${returnSlug}`,
        returnCity,
        "RETURN",
        options.endDate ?? lastWindow?.end,
      ),
    );
  }

  return drafts;
}

export { parentPathOf, slugify };
