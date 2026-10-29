import { z } from "zod";
import type { PlanClarification } from "./clarifications.js";
import {
  DEFAULT_ORIGIN_CITY,
  resolvePrimaryAirportIata,
} from "./normalize-skeleton.js";
import {
  PlanningConceptSchema,
  type PlanningConcept,
  type SkeletonCheckpoint,
  type TripSkeleton,
} from "./skeleton.js";

function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "stop";
}

export const DraftStopKindSchema = z.enum(["hub", "travel", "stay", "transit"]);

export const DraftSearchCountsSchema = z.object({
  flights: z.number().int().min(0).max(10).optional(),
  hotel: z.number().int().min(0).max(10).optional(),
  events: z.number().int().min(0).max(20).optional(),
  restaurants: z.number().int().min(0).max(20).optional(),
  places: z.number().int().min(0).max(20).optional(),
});

export const DraftStopSchema = z.object({
  id: z.string().min(1),
  kind: DraftStopKindSchema,
  name: z.string().min(1),
  role: z.enum(["departure", "return"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  nights: z.number().int().positive().max(30).optional(),
  city: z.string().optional(),
  countryCode: z.string().min(2).max(2).optional(),
  airportIata: z.string().regex(/^[A-Za-z]{3}$/).optional(),
  checkpointRole: z.enum(["STAY", "TRANSIT", "DAY_TRIP"]).optional(),
  needs: z.array(z.string()).optional(),
  notes: z.string().optional(),
  search: DraftSearchCountsSchema.optional(),
});

export const PlanningDraftCardSchema = z.object({
  title: z.string().nullable().optional(),
  concept: PlanningConceptSchema.nullable().optional(),
  tone: z.string().nullable().optional(),
  originCity: z.string().nullable().optional(),
  destinationSummary: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  partySize: z.number().int().positive().max(20).nullable().optional(),
  budgetTone: z.enum(["budget", "mid", "luxury"]).nullable().optional(),
  selectedStopId: z.string().nullable().optional(),
  stops: z.array(DraftStopSchema).default([]),
});

export type DraftStop = z.infer<typeof DraftStopSchema>;
export type DraftSearchCounts = z.infer<typeof DraftSearchCountsSchema>;
export type PlanningDraftCard = z.infer<typeof PlanningDraftCardSchema>;

export type PlanningChatMessage = {
  id: string;
  role: "user" | "assistant";
  kind: "text" | "skeleton" | "clarification";
  body: string | null;
  stopId?: string | null;
  card?: PlanningDraftCard | null;
  clarification?: PlanClarification | null;
  createdAt: string;
};

export type PlanningChatState = {
  tripId: string;
  phase: "collecting" | "draft" | "searching" | "ready";
  canSearch: boolean;
  draft: PlanningDraftCard;
  messages: PlanningChatMessage[];
};

const DEFAULT_SEARCH_BY_CONCEPT: Record<
  PlanningConcept,
  Required<Pick<DraftSearchCounts, "events" | "restaurants" | "places">>
> = {
  culture: { events: 2, restaurants: 2, places: 4 },
  entertainment: { events: 3, restaurants: 2, places: 3 },
  business: { events: 1, restaurants: 2, places: 2 },
  food: { events: 1, restaurants: 4, places: 2 },
  family: { events: 2, restaurants: 2, places: 3 },
};

function nightsFromDays(days: number): number {
  return Math.max(1, days);
}

function editorialSearch(
  checkpoint: SkeletonCheckpoint,
  concept: PlanningConcept | undefined,
): DraftSearchCounts {
  const defaults = DEFAULT_SEARCH_BY_CONCEPT[concept ?? "culture"];
  return {
    hotel: checkpoint.role === "TRANSIT" ? 0 : 1,
    events: checkpoint.search?.events ?? (checkpoint.needs.includes("events") ? defaults.events : 0),
    restaurants:
      checkpoint.search?.restaurants ??
      (checkpoint.needs.includes("places") ? defaults.restaurants : 0),
    places:
      checkpoint.search?.places ?? (checkpoint.needs.includes("places") ? defaults.places : 0),
  };
}

/** Build the chat card stops (hubs + travels + stays) from an LLM skeleton. */
export function draftCardFromSkeleton(skeleton: TripSkeleton): PlanningDraftCard {
  const originCity = skeleton.originCity?.trim() || "Jakarta";
  const concept = skeleton.concept;
  const checkpoints = skeleton.checkpoints;
  const stops: DraftStop[] = [];

  stops.push({
    id: "hub_origin",
    kind: "hub",
    name: originCity,
    role: "departure",
    city: originCity,
  });

  checkpoints.forEach((checkpoint, index) => {
    const prevCity = index === 0 ? originCity : checkpoints[index - 1]!.city;
    const stayId = `stay_${slugify(checkpoint.city)}`;
    const wantsFlight = checkpoint.needs.includes("flights");

    if (wantsFlight || index === 0) {
      stops.push({
        id: `travel_${slugify(prevCity)}_${slugify(checkpoint.city)}`,
        kind: "travel",
        name: "Terbang",
        from: prevCity,
        to: checkpoint.city,
        search: { flights: 1 },
      });
    }

    stops.push({
      id: stayId,
      kind: checkpoint.role === "TRANSIT" ? "transit" : "stay",
      name: checkpoint.city,
      city: checkpoint.city,
      countryCode: checkpoint.countryCode,
      airportIata: checkpoint.airportIata,
      checkpointRole: checkpoint.role,
      nights: nightsFromDays(checkpoint.days),
      needs: checkpoint.needs,
      notes: checkpoint.notes,
      search: editorialSearch(checkpoint, concept),
    });
  });

  if (checkpoints.length > 0) {
    const last = checkpoints[checkpoints.length - 1]!;
    stops.push({
      id: `travel_${slugify(last.city)}_${slugify(originCity)}_return`,
      kind: "travel",
      name: "Pulang",
      from: last.city,
      to: originCity,
      search: { flights: 1 },
    });
  }

  stops.push({
    id: "hub_return",
    kind: "hub",
    name: originCity,
    role: "return",
    city: originCity,
  });

  const firstStay = stops.find((stop) => stop.kind === "stay" || stop.kind === "transit");

  return {
    title: skeleton.title,
    concept: concept ?? null,
    tone: skeleton.tone ?? skeleton.summary ?? null,
    originCity,
    destinationSummary: skeleton.destinationSummary ?? null,
    startDate: skeleton.assumedStartDate ?? null,
    endDate: skeleton.assumedEndDate ?? null,
    partySize: skeleton.partySize ?? null,
    budgetTone: skeleton.budgetTone ?? null,
    selectedStopId: firstStay?.id ?? null,
    stops,
  };
}

/** Convert the live draft card back into a TripSkeleton for provider search. */
export function skeletonFromDraftCard(draft: PlanningDraftCard): TripSkeleton {
  const stays = draft.stops.filter((stop) => stop.kind === "stay" || stop.kind === "transit");
  if (stays.length === 0) {
    throw new Error("Draft has no stay stops");
  }

  const originCity = draft.originCity?.trim() || DEFAULT_ORIGIN_CITY;
  const checkpoints: SkeletonCheckpoint[] = stays.map((stay) => {
    const search = stay.search ?? {};
    const needs = new Set(stay.needs ?? []);
    if ((search.hotel ?? 0) > 0) needs.add("hotels");
    if ((search.events ?? 0) > 0) needs.add("events");
    if ((search.restaurants ?? 0) > 0 || (search.places ?? 0) > 0) needs.add("places");
    needs.add("weather");
    needs.add("checklist");

    const inboundTravel = draft.stops.find(
      (stop) => stop.kind === "travel" && stop.to === (stay.city ?? stay.name),
    );
    if ((inboundTravel?.search?.flights ?? 0) > 0) needs.add("flights");

    const city = stay.city ?? stay.name;
    return {
      city,
      countryCode: stay.countryCode,
      airportIata: stay.airportIata ?? resolvePrimaryAirportIata(city),
      role: stay.checkpointRole ?? (stay.kind === "transit" ? "TRANSIT" : "STAY"),
      days: stay.nights ?? 1,
      needs: [...needs] as SkeletonCheckpoint["needs"],
      search: {
        events: search.events,
        restaurants: search.restaurants,
        places: search.places,
      },
      notes: stay.notes,
    };
  });

  // Ensure first/last flight needs for return.
  if (checkpoints.length > 0) {
    const first = checkpoints[0]!;
    if (!first.needs.includes("flights")) {
      checkpoints[0] = { ...first, needs: ["flights", ...first.needs] };
    }
    const last = checkpoints[checkpoints.length - 1]!;
    if (!last.needs.includes("flights")) {
      checkpoints[checkpoints.length - 1] = { ...last, needs: ["flights", ...last.needs] };
    }
  }

  return {
    title: draft.title?.trim() || draft.destinationSummary?.trim() || "Trip",
    summary: draft.tone ?? undefined,
    concept: draft.concept ?? undefined,
    tone: draft.tone ?? undefined,
    originCity,
    originIata: resolvePrimaryAirportIata(originCity),
    destinationSummary: draft.destinationSummary ?? undefined,
    assumedStartDate: draft.startDate ?? undefined,
    assumedEndDate: draft.endDate ?? undefined,
    partySize: draft.partySize ?? undefined,
    budgetTone: draft.budgetTone ?? undefined,
    checkpoints,
  };
}

export function draftsEqual(a: PlanningDraftCard, b: PlanningDraftCard): boolean {
  return JSON.stringify(normalizeDraftForCompare(a)) === JSON.stringify(normalizeDraftForCompare(b));
}

function normalizeDraftForCompare(draft: PlanningDraftCard) {
  return {
    title: draft.title ?? null,
    concept: draft.concept ?? null,
    tone: draft.tone ?? null,
    originCity: draft.originCity ?? null,
    destinationSummary: draft.destinationSummary ?? null,
    startDate: draft.startDate ?? null,
    endDate: draft.endDate ?? null,
    partySize: draft.partySize ?? null,
    budgetTone: draft.budgetTone ?? null,
    stops: draft.stops.map((stop) => ({
      id: stop.id,
      kind: stop.kind,
      name: stop.name,
      role: stop.role ?? null,
      from: stop.from ?? null,
      to: stop.to ?? null,
      nights: stop.nights ?? null,
      search: stop.search ?? null,
    })),
  };
}

export function emptyDraftCard(): PlanningDraftCard {
  return {
    title: null,
    concept: null,
    tone: null,
    originCity: null,
    destinationSummary: null,
    startDate: null,
    endDate: null,
    partySize: null,
    budgetTone: null,
    selectedStopId: null,
    stops: [],
  };
}

export function canSearchDraft(draft: PlanningDraftCard, phase: string): boolean {
  if (phase !== "draft") return false;
  if (!draft.startDate) return false;
  if (!draft.stops.some((stop) => stop.kind === "stay" || stop.kind === "transit")) return false;
  return true;
}

export function snapshotCard(draft: PlanningDraftCard): PlanningDraftCard {
  return PlanningDraftCardSchema.parse(JSON.parse(JSON.stringify(draft)));
}
