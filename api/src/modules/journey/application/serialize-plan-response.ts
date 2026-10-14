import { resolveOfferDeepLink } from "../../../shared/deep-link.js";
import { moneyToNumber } from "./serialize-trip.js";

type CatalogRow = {
  id: string;
  raw?: unknown;
  name?: string | null;
  title?: string | null;
  provider?: string | null;
  kind?: string | null;
  places?: unknown;
  daily?: unknown;
  alerts?: unknown;
  summary?: string | null;
  items?: unknown;
  mode?: string | null;
  durationMinutes?: number | null;
  distanceMeters?: number | null;
};

type StoredBooking = {
  id: string;
  kind: string;
  role?: string | null;
  sortOrder?: number;
  costAmount?: unknown;
  costCurrency?: string | null;
  costIsEstimate?: boolean;
  deepLinkUrl?: string | null;
  flight?: CatalogRow | null;
  hotel?: CatalogRow | null;
  event?: CatalogRow | null;
  place?: CatalogRow | null;
  route?: CatalogRow | null;
  weather?: CatalogRow | null;
  visa?: CatalogRow | null;
  checklist?: CatalogRow | null;
};

type StoredStop = {
  id: string;
  parentStopId?: string | null;
  sortOrder?: number;
  kind: string;
  hubRole?: string | null;
  slug: string;
  name: string;
  subtitle?: string | null;
  days?: number | null;
  countryCode?: string | null;
  city?: string | null;
  scheduleStart?: unknown;
  scheduleEnd?: unknown;
  dateStart?: unknown;
  dateEnd?: unknown;
  bookings?: StoredBooking[];
  medias?: Array<{
    imageUrl?: string | null;
    thumbnailUrl?: string | null;
    attribution?: unknown;
    role?: string | null;
  }>;
  notes?: Array<{ body?: string | null; title?: string | null }>;
  budgets?: Array<{ category?: string | null; amount?: unknown; currency?: string | null; isEstimate?: boolean }>;
};

type StoredTrip = {
  id: string;
  userId?: string;
  title: string;
  status: string;
  originCity?: string | null;
  destinationSummary?: string | null;
  startDate?: unknown;
  endDate?: unknown;
  partySize?: number;
  baseCurrency?: string;
  totalCostAmount?: unknown;
  totalCostIsEstimate?: boolean;
  totalDurationMinutes?: number;
  coverImageUrl?: string | null;
  planningVersion?: number;
  lastPlannedAt?: unknown;
  /** Trip-scoped catalog rows (fallback when booking links are missing). */
  checklists?: CatalogRow[] | null;
  journey?: {
    id?: string | null;
    name?: string | null;
    stops?: StoredStop[];
  } | null;
};

type Catalog = {
  flights: Record<string, Record<string, unknown>>;
  hotels: Record<string, Record<string, unknown>>;
  events: Record<string, Record<string, unknown>>;
  places: Record<string, Record<string, unknown>>;
  routes: Record<string, Record<string, unknown>>;
  weather: Record<string, Record<string, unknown>>;
  visas: Record<string, Record<string, unknown>>;
  checklists: Record<string, Record<string, unknown>>;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function dateValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value ?? null;
}

function dayValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value ?? null;
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 24) || "stop"
  );
}

function budgetFrom(amount: unknown, currency: string | null | undefined, isEstimate: boolean | undefined, fallback: string) {
  return {
    amount: moneyToNumber(amount),
    currency: currency ?? fallback,
    isEstimate: isEstimate ?? true,
  };
}

function catalogPayload(row: CatalogRow | null | undefined): Record<string, unknown> {
  if (!row) return {};
  const raw = record(row.raw);
  const rest: Record<string, unknown> = { ...row };
  delete rest.raw;
  const merged: Record<string, unknown> = { ...raw, ...rest };

  // MCP wraps items under `checklist.items`; row.items can be empty if write path missed them.
  const nested = record(raw.checklist);
  const fromRow = Array.isArray(rest.items) ? (rest.items as unknown[]) : [];
  const fromNested = Array.isArray(nested.items) ? (nested.items as unknown[]) : [];
  const fromRaw = Array.isArray(raw.items) ? (raw.items as unknown[]) : [];
  const items = fromRow.length > 0 ? fromRow : fromNested.length > 0 ? fromNested : fromRaw;
  if (items.length > 0) merged.items = items;

  return merged;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function rowFor(booking: StoredBooking): CatalogRow | null {
  switch (booking.kind) {
    case "flight":
      return booking.flight ?? null;
    case "hotel":
      return booking.hotel ?? null;
    case "event":
      return booking.event ?? null;
    case "place":
      return booking.place ?? null;
    case "route":
      return booking.route ?? null;
    case "weather":
      return booking.weather ?? null;
    case "visa":
      return booking.visa ?? null;
    case "checklist":
      return booking.checklist ?? null;
    default:
      return null;
  }
}

export function serializePlanResponse(input: {
  trip: StoredTrip;
  llm?: string;
  mcp?: string;
  clarifications?: unknown[];
}) {
  const { trip } = input;
  const currency = trip.baseCurrency ?? "IDR";
  const journey = trip.journey;
  const sourceStops = [...(journey?.stops ?? [])]
    .filter((stop) => stop.parentStopId == null)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const catalog: Catalog = {
    flights: {},
    hotels: {},
    events: {},
    places: {},
    routes: {},
    weather: {},
    visas: {},
    checklists: {},
  };
  let flightNo = 0;
  let hotelNo = 0;
  let eventNo = 0;
  let placeNo = 0;
  let routeNo = 0;
  let weatherNo = 0;
  let visaNo = 0;
  let checklistNo = 0;

  const stops = sourceStops.map((stop) => {
    const city = stop.city ?? stop.name;
    const citySlug = slug(city);
    const flightIds: string[] = [];
    const hotelIds: string[] = [];
    const eventIds: string[] = [];
    const placeIds: string[] = [];
    const routeIds: string[] = [];
    const weatherIds: string[] = [];
    const bookings = [...(stop.bookings ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    for (const booking of bookings) {
      const row = rowFor(booking);
      const content = catalogPayload(row);
      const deepLinkUrl = resolveOfferDeepLink(booking.kind, content, booking.deepLinkUrl);
      if (deepLinkUrl) {
        content.deepLinkUrl = deepLinkUrl;
        content.deepLink = deepLinkUrl;
      }
      const cost = budgetFrom(booking.costAmount, booking.costCurrency, booking.costIsEstimate, currency);
      if (booking.kind === "flight") {
        const id = `flt_${citySlug}_${++flightNo}`;
        catalog.flights[id] = { ...content, id, nodeId: booking.id, title: textTitle(row, "Flight"), cost };
        flightIds.push(id);
      } else if (booking.kind === "hotel") {
        const id = `htl_${citySlug}_${++hotelNo}`;
        catalog.hotels[id] = { ...content, id, nodeId: booking.id, title: textTitle(row, "Hotel"), cost };
        hotelIds.push(id);
      } else if (booking.kind === "event") {
        const id = `evt_${citySlug}_${++eventNo}`;
        catalog.events[id] = { ...content, id, nodeId: booking.id, title: textTitle(row, "Event"), cost };
        eventIds.push(id);
      } else if (booking.kind === "place") {
        const kind = row?.kind === "restaurants" ? "restaurants" : "pois";
        const id = `plc_${kind}_${citySlug}_${++placeNo}`;
        catalog.places[id] = { ...content, id, nodeId: booking.id, title: textTitle(row, kind), kind, cost };
        placeIds.push(id);
      } else if (booking.kind === "route") {
        const id = `rte_${citySlug}_${++routeNo}`;
        catalog.routes[id] = { ...content, id, nodeId: booking.id, title: "Route", cost };
        routeIds.push(id);
      } else if (booking.kind === "weather") {
        const id = `wx_${citySlug}_${++weatherNo}`;
        catalog.weather[id] = { ...content, id, nodeId: booking.id, title: "Weather", cost };
        weatherIds.push(id);
      } else if (booking.kind === "visa") {
        const id = `visa_${citySlug}_${++visaNo}`;
        catalog.visas[id] = { ...content, id, nodeId: booking.id, title: "Visa", cost };
      } else if (booking.kind === "checklist") {
        const id = `chk_${citySlug}_${++checklistNo}`;
        catalog.checklists[id] = {
          ...content,
          catalogId: row?.id ?? null,
          id,
          nodeId: booking.id,
          title: textTitle(row, "Travel checklist"),
          cost,
        };
      }
    }

    const totalBudget = (stop.budgets ?? []).find((item) => item.category === "total") ?? stop.budgets?.[0];
    const bookingAmount = bookings.reduce((sum, booking) => sum + moneyToNumber(booking.costAmount), 0);
    const cover = (stop.medias ?? []).find((media) => media.role === "cover") ?? stop.medias?.[0];
    const noteBodies = (stop.notes ?? [])
      .map((note) => note.body)
      .filter((body): body is string => typeof body === "string" && body.length > 0);

    const view: Record<string, unknown> = {
      id: stop.slug,
      kind: stop.kind,
      name: stop.name,
      subtitle: stop.subtitle ?? null,
      nodeId: stop.id,
      bookings: { flightIds, hotelIds, eventIds },
      maps: {
        href: `/v1/trips/${trip.id}/nodes?parentId=${stop.id}`,
        routeIds,
        placeIds,
        weatherIds,
      },
      budget: totalBudget
        ? budgetFrom(totalBudget.amount, totalBudget.currency, totalBudget.isEstimate, currency)
        : budgetFrom(bookingAmount, currency, true, currency),
      notes: noteBodies,
    };
    if (stop.hubRole) view.role = stop.hubRole;
    if (stop.kind === "hub") {
      view.schedule = { at: dateValue(stop.scheduleStart) };
    } else if (stop.kind === "travel") {
      view.schedule = {
        start: dateValue(stop.scheduleStart),
        end: dateValue(stop.scheduleEnd),
      };
    } else {
      view.days = stop.days ?? null;
      view.dates = {
        start: dayValue(stop.dateStart) ?? dateValue(stop.scheduleStart),
        end: dayValue(stop.dateEnd) ?? dateValue(stop.scheduleEnd),
      };
      view.countryCode = stop.countryCode ?? null;
    }
    if (cover?.imageUrl || cover?.thumbnailUrl) {
      view.media = {
        imageUrl: cover.imageUrl ?? null,
        thumbnailUrl: cover.thumbnailUrl ?? null,
        imageAttribution: cover.attribution ?? null,
      };
    }
    return view;
  });

  shareFlightIds(stops);

  // Ensure catalog_checklists rows always appear even if booking.checklist link is missing.
  const seenChecklistIds = new Set<string>();
  for (const entry of Object.values(catalog.checklists)) {
    const catalogId = entry.catalogId;
    if (isUuid(catalogId)) seenChecklistIds.add(catalogId);
    if (isUuid(entry.id)) seenChecklistIds.add(entry.id as string);
  }
  for (const row of trip.checklists ?? []) {
    if (!row?.id || seenChecklistIds.has(row.id)) continue;
    const id = `chk_trip_${++checklistNo}`;
    const content = catalogPayload(row);
    catalog.checklists[id] = {
      ...content,
      catalogId: row.id,
      id,
      title: textTitle(row, "Travel checklist"),
      cost: budgetFrom(0, currency, true, currency),
    };
    seenChecklistIds.add(row.id);
  }

  return {
    trip: {
      id: trip.id,
      name: trip.title,
      status: trip.status,
      userId: trip.userId ?? null,
      originCity: trip.originCity ?? null,
      destinationSummary: trip.destinationSummary ?? null,
      dates: {
        start: dateValue(trip.startDate),
        end: dateValue(trip.endDate),
      },
      partySize: trip.partySize ?? 1,
      currency,
      totals: {
        amount: moneyToNumber(trip.totalCostAmount),
        currency,
        isEstimate: trip.totalCostIsEstimate ?? true,
        durationMinutes: trip.totalDurationMinutes ?? 0,
      },
      coverImageUrl: trip.coverImageUrl ?? null,
      planningVersion: trip.planningVersion ?? 0,
      lastPlannedAt: dateValue(trip.lastPlannedAt),
    },
    journey: {
      id: journey?.id ?? null,
      name: journey?.name ?? trip.title,
      stops,
    },
    catalog,
    meta: {
      llm: input.llm ?? null,
      mcp: input.mcp ?? null,
      clarifications: input.clarifications ?? [],
      schema: "trip+journey.stops+catalog",
    },
  };
}

function textTitle(row: CatalogRow | null, fallback: string): string {
  if (!row) return fallback;
  if (typeof row.name === "string" && row.name.length > 0) return row.name;
  if (typeof row.title === "string" && row.title.length > 0) return row.title;
  const raw = record(row.raw);
  if (typeof raw.name === "string") return raw.name;
  if (typeof raw.title === "string") return raw.title;
  if (typeof raw.carrier === "string") return raw.carrier;
  return fallback;
}

function flightIdsOf(stop: Record<string, unknown>): string[] {
  const value = record(stop.bookings).flightIds;
  return Array.isArray(value) ? (value as string[]) : [];
}

function shareFlightIds(stops: Array<Record<string, unknown>>) {
  for (const stop of stops) {
    if (stop.kind !== "stay" && stop.kind !== "transit") continue;
    if (flightIdsOf(stop).length > 0) continue;
    const index = stops.indexOf(stop);
    const travel =
      [...stops.slice(0, index)].reverse().find((item) => item.kind === "travel" && flightIdsOf(item).length > 0) ??
      stops.slice(index + 1).find((item) => item.kind === "travel" && flightIdsOf(item).length > 0);
    if (travel) record(stop.bookings).flightIds = [...flightIdsOf(travel)];
  }

  for (let index = 0; index < stops.length; index++) {
    const stop = stops[index]!;
    if (stop.kind !== "travel" || flightIdsOf(stop).length > 0) continue;
    const pool = /return/i.test(String(stop.name))
      ? [...stops.slice(0, index)].reverse()
      : stops.slice(index + 1);
    const stay = pool.find(
      (item) => (item.kind === "stay" || item.kind === "transit") && flightIdsOf(item).length > 0,
    );
    if (stay) record(stop.bookings).flightIds = [...flightIdsOf(stay)];
  }
}
