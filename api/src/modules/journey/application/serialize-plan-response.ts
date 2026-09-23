import { moneyToNumber } from "./serialize-trip.js";

type PlanNode = {
  id: string;
  parentId?: string | null;
  sortOrder?: number;
  type: string;
  checkpointKind?: string | null;
  title: string;
  subtitle?: string | null;
  contentType?: string | null;
  content?: unknown;
  scheduleStart?: unknown;
  scheduleEnd?: unknown;
  costAmount?: unknown;
  costCurrency?: string;
  costIsEstimate?: boolean;
  userNotes?: string | null;
};

type PlanTrip = {
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
  nodes: PlanNode[];
};

type Catalog = {
  flights: Record<string, Record<string, unknown>>;
  hotels: Record<string, Record<string, unknown>>;
  events: Record<string, Record<string, unknown>>;
  places: Record<string, Record<string, unknown>>;
  routes: Record<string, Record<string, unknown>>;
  weather: Record<string, Record<string, unknown>>;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function dateValue(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value ?? null;
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

function budget(node: PlanNode, fallbackCurrency: string) {
  return {
    amount: moneyToNumber(node.costAmount),
    currency: node.costCurrency ?? fallbackCurrency,
    isEstimate: node.costIsEstimate ?? true,
  };
}

function media(content: Record<string, unknown>) {
  return {
    imageUrl: content.imageUrl ?? null,
    thumbnailUrl: content.thumbnailUrl ?? null,
    imageAttribution: content.imageAttribution ?? null,
  };
}

function catalogEntry(
  id: string,
  node: PlanNode,
  content: Record<string, unknown>,
  fallbackCurrency: string,
): Record<string, unknown> {
  return {
    ...content,
    id,
    nodeId: node.id,
    title: node.title,
    cost: budget(node, fallbackCurrency),
  };
}

export function serializePlanResponse(input: {
  trip: PlanTrip;
  llm?: string;
  mcp?: string;
  clarifications?: unknown[];
}) {
  const { trip } = input;
  const currency = trip.baseCurrency ?? "IDR";
  const root = trip.nodes.find((node) => node.parentId == null && node.type === "JOURNEY");
  const rootChildren = root
    ? trip.nodes
        .filter((node) => node.parentId === root.id)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    : [];
  const childrenByParent = new Map<string, PlanNode[]>();
  for (const node of trip.nodes) {
    if (!node.parentId) continue;
    const children = childrenByParent.get(node.parentId) ?? [];
    children.push(node);
    childrenByParent.set(node.parentId, children);
  }

  const catalog: Catalog = {
    flights: {},
    hotels: {},
    events: {},
    places: {},
    routes: {},
    weather: {},
  };
  const stops: Array<Record<string, unknown>> = [];
  let flightNo = 0;
  let hotelNo = 0;
  let eventNo = 0;
  let placeNo = 0;
  let routeNo = 0;
  let weatherNo = 0;

  for (const node of rootChildren) {
    const content = record(node.content);
    const city = String(content.city ?? node.title);
    const citySlug = slug(city);
    const role = node.checkpointKind?.toLowerCase();

    if (node.type === "LEG" && node.contentType === "leg") {
      stops.push({
        id: /return/i.test(node.title) ? "travel_return" : `travel_${stops.length + 1}`,
        kind: "travel",
        name: node.title,
        subtitle: node.subtitle ?? null,
        nodeId: node.id,
        schedule: {
          start: dateValue(node.scheduleStart),
          end: dateValue(node.scheduleEnd),
        },
        bookings: { flightIds: [], hotelIds: [], eventIds: [] },
        maps: { href: `/v1/trips/${trip.id}/nodes?parentId=${node.id}` },
        budget: budget(node, currency),
        notes: node.userNotes ? [node.userNotes] : [],
      });
      continue;
    }

    if (node.type !== "CHECKPOINT") continue;

    if (node.checkpointKind === "ORIGIN" || node.checkpointKind === "RETURN") {
      const hubRole = node.checkpointKind.toLowerCase();
      stops.push({
        id: `hub_${hubRole}`,
        kind: "hub",
        role: hubRole,
        name: city,
        nodeId: node.id,
        schedule: { at: dateValue(node.scheduleStart) },
        media: media(content),
        bookings: { flightIds: [], hotelIds: [], eventIds: [] },
        maps: { href: `/v1/trips/${trip.id}/nodes?parentId=${node.id}` },
        budget: budget(node, currency),
        notes: node.userNotes ? [node.userNotes] : [],
      });
      continue;
    }

    const flightIds: string[] = [];
    const hotelIds: string[] = [];
    const eventIds: string[] = [];
    const placeIds: string[] = [];
    const routeIds: string[] = [];
    const weatherIds: string[] = [];
    const children = (childrenByParent.get(node.id) ?? []).sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    );

    for (const child of children) {
      const childContent = record(child.content);
      if (child.contentType === "flight") {
        const id = `flt_${citySlug}_${++flightNo}`;
        catalog.flights[id] = catalogEntry(id, child, childContent, currency);
        flightIds.push(id);
      } else if (child.contentType === "hotel") {
        const id = `htl_${citySlug}_${++hotelNo}`;
        catalog.hotels[id] = catalogEntry(id, child, childContent, currency);
        hotelIds.push(id);
      } else if (child.contentType === "event") {
        const id = `evt_${citySlug}_${++eventNo}`;
        catalog.events[id] = catalogEntry(id, child, childContent, currency);
        eventIds.push(id);
      } else if (
        child.contentType === "places.restaurants" ||
        child.contentType === "places.pois"
      ) {
        const kind =
          child.contentType === "places.restaurants" ? "restaurants" : "pois";
        const id = `plc_${kind}_${citySlug}_${++placeNo}`;
        catalog.places[id] = {
          ...catalogEntry(id, child, childContent, currency),
          kind,
        };
        placeIds.push(id);
      } else if (child.contentType === "route") {
        const id = `rte_${citySlug}_${++routeNo}`;
        const route = record(childContent.route);
        catalog.routes[id] = catalogEntry(
          id,
          child,
          { ...route, provider: route.provider ?? childContent.provider },
          currency,
        );
        routeIds.push(id);
      } else if (child.contentType === "weather.forecast") {
        const id = `wx_${citySlug}_${++weatherNo}`;
        const forecast = record(childContent.forecast);
        catalog.weather[id] = catalogEntry(
          id,
          child,
          { ...forecast, provider: forecast.provider ?? childContent.provider },
          currency,
        );
        weatherIds.push(id);
      }
    }

    stops.push({
      id: `${role ?? "checkpoint"}_${citySlug}`,
      kind: role ?? "checkpoint",
      name: city,
      nodeId: node.id,
      days: content.days ?? null,
      dates: {
        start: content.startDate ?? dateValue(node.scheduleStart),
        end: content.endDate ?? dateValue(node.scheduleEnd),
      },
      countryCode: content.countryCode ?? null,
      media: media(content),
      bookings: { flightIds, hotelIds, eventIds },
      maps: {
        href: `/v1/trips/${trip.id}/nodes?parentId=${node.id}`,
        routeIds,
        placeIds,
        weatherIds,
      },
      budget: budget(node, currency),
      notes: [
        ...(typeof content.notes === "string" ? [content.notes] : []),
        ...(node.userNotes ? [node.userNotes] : []),
      ],
    });
  }

  // Flight entities live under destination checkpoints in storage. Also reference
  // them from adjacent travel stops so the response reads as an itinerary.
  for (let index = 0; index < stops.length; index++) {
    const stop = stops[index]!;
    if (stop.kind !== "travel") continue;
    const adjacentStops = /return/i.test(String(stop.name))
      ? stops.slice(0, index).reverse()
      : stops.slice(index + 1);
    const adjacent = adjacentStops.find(
      (candidate) =>
        candidate.kind !== "hub" &&
        record(candidate.bookings).flightIds instanceof Array &&
        (record(candidate.bookings).flightIds as unknown[]).length > 0,
    );
    if (adjacent) {
      record(stop.bookings).flightIds = [
        ...((record(adjacent.bookings).flightIds as string[]) ?? []),
      ];
    }
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
      id: root?.id ?? null,
      name: root?.title ?? trip.title,
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
