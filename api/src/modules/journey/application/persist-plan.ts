import type { CheckpointToolResults } from "../../planner/service.js";
import {
  allocateCheckpointWindows,
  atUtcNoon,
  hotelCheckOutIso,
  type CheckpointScheduleWindow,
} from "../../planner/domain/checkpoint-schedule.js";
import {
  DEFAULT_ORIGIN_CITY,
  resolvePrimaryAirportIata,
} from "../../planner/domain/normalize-skeleton.js";
import type { SkeletonCheckpoint, TripSkeleton } from "../../planner/domain/skeleton.js";
import type { McpToolResult } from "../../../shared/mcp/index.js";
import { resolveOfferDeepLink } from "../../../shared/deep-link.js";

export type BuildPlanDraftsOptions = {
  originCity?: string;
  returnCity?: string;
  originIata?: string;
  startDate?: string;
  endDate?: string;
};

export type BookingKind =
  | "flight"
  | "hotel"
  | "event"
  | "place"
  | "route"
  | "weather"
  | "visa"
  | "checklist";

export type PlanBookingDraft = {
  path: string;
  kind: BookingKind;
  role: "selected" | "recommended";
  provider?: string;
  providerRef?: string;
  deepLinkUrl?: string;
  costAmount?: number;
  costCurrency?: string;
  payload: Record<string, unknown>;
};

export type PlanNoteDraft = {
  kind: "about" | "system";
  title?: string;
  body: string;
};

export type PlanMediaDraft = {
  imageUrl: string;
  thumbnailUrl?: string;
  provider?: string;
  providerRef?: string;
  attribution?: Record<string, unknown>;
};

export type PlanStopDraft = {
  path: string;
  slug: string;
  kind: "hub" | "travel" | "stay" | "transit";
  hubRole?: "origin" | "return";
  name: string;
  subtitle?: string;
  days?: number;
  countryCode?: string;
  city?: string;
  scheduleStart?: Date;
  scheduleEnd?: Date;
  dateStart?: string;
  dateEnd?: string;
  bookings: PlanBookingDraft[];
  notes: PlanNoteDraft[];
  media?: PlanMediaDraft;
};

function parentPathOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "journey" : path.slice(0, idx);
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 48) || "stop"
  );
}

function uniqueSlug(base: string, used: Set<string>): string {
  let slug = slugify(base);
  if (!used.has(slug)) {
    used.add(slug);
    return slug;
  }
  let index = 2;
  while (used.has(`${slug}_${index}`)) index += 1;
  slug = `${slug}_${index}`;
  used.add(slug);
  return slug;
}

function citiesEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function roleToKind(role: SkeletonCheckpoint["role"]): "stay" | "transit" {
  return role === "TRANSIT" ? "transit" : "stay";
}

function hubStop(
  used: Set<string>,
  city: string,
  hubRole: "origin" | "return",
  scheduleIso?: string,
): PlanStopDraft {
  const slug = uniqueSlug(hubRole === "origin" ? "hub_origin" : "hub_return", used);
  const at = atUtcNoon(scheduleIso);
  return {
    path: `journey/${slug}`,
    slug,
    kind: "hub",
    hubRole,
    name: city,
    subtitle: hubRole === "origin" ? "Departure" : "Return",
    city,
    scheduleStart: at,
    scheduleEnd: at,
    dateStart: scheduleIso,
    dateEnd: scheduleIso,
    bookings: [],
    notes: [],
  };
}

function travelStop(
  used: Set<string>,
  slugBase: string,
  name: string,
  subtitle: string,
  scheduleIso?: string,
): PlanStopDraft {
  const slug = uniqueSlug(slugBase, used);
  const at = atUtcNoon(scheduleIso);
  return {
    path: `journey/${slug}`,
    slug,
    kind: "travel",
    name,
    subtitle,
    scheduleStart: at,
    scheduleEnd: at,
    dateStart: scheduleIso,
    dateEnd: scheduleIso,
    bookings: [],
    notes: [],
  };
}

function applyWindow(payload: Record<string, unknown>, window: CheckpointScheduleWindow | null, kind: BookingKind): Record<string, unknown> {
  if (!window || kind !== "hotel") return payload;
  return {
    ...payload,
    checkIn: window.start,
    checkOut: hotelCheckOutIso(window),
  };
}

function bookingsFromTool(
  parentPath: string,
  result: McpToolResult,
  childSlug: string,
  window: CheckpointScheduleWindow | null,
): { bookings: PlanBookingDraft[]; notes: PlanNoteDraft[] } {
  if (!result.ok || !result.data || typeof result.data !== "object") {
    return { bookings: [], notes: [] };
  }
  const data = result.data as Record<string, unknown>;
  const provider = typeof data.provider === "string" ? data.provider : undefined;
  const path = `${parentPath}/${childSlug}`;
  const notes: PlanNoteDraft[] = [];

  if (result.tool === "generate_checklist") {
    const tips = Array.isArray(data.tips) ? data.tips : [];
    for (const tip of tips) {
      const row = asRecord(tip);
      if (!row) continue;
      const body = typeof row.body === "string" ? row.body : "";
      if (!body) continue;
      notes.push({
        kind: "system",
        title: typeof row.title === "string" ? row.title : "Travel tips",
        body,
      });
    }
  }

  const booking = bookingFromTool(path, result.tool, data, provider, window);
  return { bookings: booking ? [booking] : [], notes };
}

function bookingFromTool(
  path: string,
  tool: string,
  data: Record<string, unknown>,
  provider: string | undefined,
  window: CheckpointScheduleWindow | null,
): PlanBookingDraft | null {
  switch (tool) {
    case "search_flights": {
      const offer = asRecord(firstArrayItem(data.offers));
      if (!offer) return null;
      const money = moneyFromUnknown(offer.price);
      const payload = { ...offer, provider };
      return {
        path,
        kind: "flight",
        role: "selected",
        provider,
        providerRef:
          typeof offer.providerRef === "string"
            ? offer.providerRef
            : typeof offer.id === "string"
              ? offer.id
              : undefined,
        deepLinkUrl: resolveOfferDeepLink("flight", payload),
        costAmount: money?.amount,
        costCurrency: money?.currency,
        payload,
      };
    }
    case "search_hotels": {
      const hotel = asRecord(firstArrayItem(data.hotels));
      if (!hotel) return null;
      const money = moneyFromUnknown(hotel.price);
      const payload = applyWindow({ ...hotel, provider }, window, "hotel");
      return {
        path,
        kind: "hotel",
        role: "selected",
        provider,
        providerRef: typeof hotel.hotelId === "string" ? hotel.hotelId : undefined,
        deepLinkUrl: resolveOfferDeepLink("hotel", payload),
        costAmount: money?.amount,
        costCurrency: money?.currency,
        payload,
      };
    }
    case "search_events":
    case "search_tours": {
      const event = asRecord(firstArrayItem(data.events));
      if (!event) return null;
      const money = moneyFromUnknown(event.price);
      const payload = { ...event, provider };
      return {
        path,
        kind: "event",
        role: "recommended",
        provider,
        providerRef: typeof event.id === "string" ? event.id : typeof event.externalId === "string" ? event.externalId : undefined,
        deepLinkUrl: resolveOfferDeepLink("event", payload),
        costAmount: money?.amount,
        costCurrency: money?.currency,
        payload,
      };
    }
    case "search_restaurants":
    case "search_pois":
    case "search_places":
      return {
        path,
        kind: "place",
        role: "recommended",
        provider,
        payload: {
          ...data,
          placeKind: tool === "search_restaurants" ? "restaurants" : "pois",
        },
      };
    case "get_route":
      return {
        path,
        kind: "route",
        role: "recommended",
        provider,
        payload: data,
      };
    case "get_forecast":
      return {
        path,
        kind: "weather",
        role: "recommended",
        provider,
        payload: data,
      };
    case "get_visa_requirements":
      return {
        path,
        kind: "visa",
        role: "recommended",
        provider,
        payload: data,
      };
    case "generate_checklist":
      return {
        path,
        kind: "checklist",
        role: "recommended",
        provider,
        payload: data,
      };
    default:
      return null;
  }
}

function flightRouteOf(booking: PlanBookingDraft): { origin?: string; destination?: string } {
  const payload = booking.payload;
  const origin =
    typeof payload.origin === "string"
      ? payload.origin.toUpperCase()
      : typeof (payload.originAirport as { code?: string } | undefined)?.code === "string"
        ? (payload.originAirport as { code: string }).code.toUpperCase()
        : undefined;
  const destination =
    typeof payload.destination === "string"
      ? payload.destination.toUpperCase()
      : typeof (payload.destinationAirport as { code?: string } | undefined)?.code === "string"
        ? (payload.destinationAirport as { code: string }).code.toUpperCase()
        : undefined;
  return { origin, destination };
}

/** Top-level hub / travel / stay graph. Catalog offers hang off bookings, not child stops. */
export function buildPlanDrafts(
  skeleton: TripSkeleton,
  execution: { checkpoints: CheckpointToolResults[] },
  options: BuildPlanDraftsOptions = {},
): PlanStopDraft[] {
  const stops: PlanStopDraft[] = [];
  const usedSlugs = new Set<string>();
  const originCity = options.originCity ?? skeleton.originCity ?? DEFAULT_ORIGIN_CITY;
  const returnCity = options.returnCity ?? originCity;
  const homeIata = (
    options.originIata ??
    skeleton.originIata ??
    resolvePrimaryAirportIata(originCity)
  )?.toUpperCase();
  const destinations = skeleton.checkpoints;
  const windows = allocateCheckpointWindows(destinations, {
    start: options.startDate,
    end: options.endDate,
  });
  const lastWindow = [...windows].reverse().find((window) => window != null) ?? null;
  const pendingReturnFlights: PlanBookingDraft[] = [];

  if (originCity && destinations.length > 0) {
    stops.push(hubStop(usedSlugs, originCity, "origin", options.startDate));
  }

  let previousCity = originCity;
  destinations.forEach((checkpoint, index) => {
    const window = windows[index] ?? null;
    const stayDays = window?.days ?? checkpoint.days;
    let inbound: PlanStopDraft | null = null;
    if (previousCity && !citiesEqual(previousCity, checkpoint.city)) {
      const outbound = index === 0;
      inbound = travelStop(
        usedSlugs,
        outbound ? "travel_outbound" : `travel_to_${slugify(checkpoint.city)}`,
        outbound ? `Flight to ${checkpoint.city}` : `Travel to ${checkpoint.city}`,
        `From ${previousCity}`,
        window?.start ?? options.startDate,
      );
      stops.push(inbound);
    }

    const slug = uniqueSlug(`stay_${slugify(checkpoint.city)}`, usedSlugs);
    const stay: PlanStopDraft = {
      path: `journey/${slug}`,
      slug,
      kind: roleToKind(checkpoint.role),
      name: checkpoint.city,
      subtitle: checkpoint.notes ?? `${stayDays} day(s)`,
      days: stayDays,
      countryCode: checkpoint.countryCode,
      city: checkpoint.city,
      scheduleStart: atUtcNoon(window?.start),
      scheduleEnd: atUtcNoon(window?.end),
      dateStart: window?.start,
      dateEnd: window?.end,
      bookings: [],
      notes: checkpoint.notes ? [{ kind: "about", body: checkpoint.notes }] : [],
    };

    const results = execution.checkpoints[index]?.results ?? [];
    results.forEach((result, toolIndex) => {
      const childSlug = `${slugify(result.tool)}_${toolIndex + 1}`;
      if (result.tool === "search_flights") {
        // Temporary path; rewritten below once the travel target is known.
        const built = bookingsFromTool(`journey/pending_flight`, result, childSlug, window);
        for (const booking of built.bookings) {
          const route = flightRouteOf(booking);
          const isReturn =
            homeIata != null &&
            route.destination === homeIata &&
            (!route.origin || route.origin !== homeIata);
          if (isReturn) {
            pendingReturnFlights.push(booking);
          } else {
            const target = inbound ?? stay;
            booking.path = `${target.path}/${childSlug}`;
            target.bookings.push(booking);
          }
        }
        stay.notes.push(...built.notes);
        return;
      }

      const target = stay;
      const built = bookingsFromTool(target.path, result, childSlug, window);
      target.bookings.push(...built.bookings);
      stay.notes.push(...built.notes);
    });

    stops.push(stay);
    previousCity = checkpoint.city;
  });

  if (returnCity && destinations.length > 0) {
    const lastDestination = destinations[destinations.length - 1]!;
    if (!citiesEqual(lastDestination.city, returnCity)) {
      const returnTravel = travelStop(
        usedSlugs,
        "travel_return",
        `Return to ${returnCity}`,
        `From ${lastDestination.city}`,
        lastWindow?.end ?? options.endDate,
      );
      for (const [index, booking] of pendingReturnFlights.entries()) {
        booking.path = `${returnTravel.path}/search_flights_return_${index + 1}`;
        returnTravel.bookings.push(booking);
      }
      stops.push(returnTravel);
    } else {
      // Nowhere to hang return flights if home == last destination.
      const lastStay = [...stops].reverse().find((stop) => stop.kind === "stay" || stop.kind === "transit");
      if (lastStay) {
        for (const booking of pendingReturnFlights) {
          booking.path = `${lastStay.path}/search_flights_return`;
          lastStay.bookings.push(booking);
        }
      }
    }
    stops.push(hubStop(usedSlugs, returnCity, "return", options.endDate ?? lastWindow?.end));
  }

  return stops;
}

export { parentPathOf, slugify };
