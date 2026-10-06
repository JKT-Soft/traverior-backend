import type { PlanningConcept, PlanningMessageKind, PlanningMessageRole, PlanningPhase, Prisma } from "@prisma/client";
import type { PlanClarification } from "../../planner/domain/clarifications.js";
import {
  canSearchDraft,
  draftCardFromSkeleton,
  draftsEqual,
  emptyDraftCard,
  PlanningDraftCardSchema,
  skeletonFromDraftCard,
  snapshotCard,
  type PlanningChatMessage,
  type PlanningChatState,
  type PlanningDraftCard,
} from "../../planner/domain/planning-draft.js";
import type { PlanSkeletonInput, TripSkeleton } from "../../planner/domain/skeleton.js";

type DraftRow = {
  id: string;
  tripId: string;
  phase: PlanningPhase;
  title: string | null;
  concept: PlanningConcept | null;
  tone: string | null;
  originCity: string | null;
  startDate: Date | null;
  endDate: Date | null;
  partySize: number | null;
  selectedStopId: string | null;
  stops: Prisma.JsonValue;
};

type MessageRow = {
  id: string;
  tripId: string;
  position: number;
  role: PlanningMessageRole;
  kind: PlanningMessageKind;
  body: string | null;
  draftStopId: string | null;
  payload: Prisma.JsonValue | null;
  createdAt: Date;
};

export function cardFromDraftRow(row: DraftRow | null | undefined): PlanningDraftCard {
  if (!row) return emptyDraftCard();
  const stops = Array.isArray(row.stops) ? row.stops : [];
  const stayNames = stops
    .map((stop) => {
      if (!stop || typeof stop !== "object" || Array.isArray(stop)) return null;
      const record = stop as Record<string, unknown>;
      if (record.kind !== "stay" && record.kind !== "transit") return null;
      return typeof record.name === "string" ? record.name : null;
    })
    .filter((name): name is string => Boolean(name));
  return PlanningDraftCardSchema.parse({
    title: row.title,
    concept: row.concept,
    tone: row.tone,
    originCity: row.originCity,
    destinationSummary: stayNames.length > 0 ? stayNames.join(", ") : null,
    startDate: row.startDate ? row.startDate.toISOString().slice(0, 10) : null,
    endDate: row.endDate ? row.endDate.toISOString().slice(0, 10) : null,
    partySize: row.partySize,
    selectedStopId: row.selectedStopId,
    stops,
  });
}

export function serializePlanningMessage(row: MessageRow): PlanningChatMessage {
  const payload =
    row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : null;

  let card: PlanningDraftCard | null = null;
  let clarification: PlanClarification | null = null;
  if (row.kind === "skeleton" && payload) {
    card = PlanningDraftCardSchema.parse(payload.card ?? payload);
  }
  if (row.kind === "clarification" && payload) {
    clarification = payload.clarification as PlanClarification;
  }

  return {
    id: row.id,
    role: row.role,
    kind: row.kind,
    body: row.body,
    stopId: row.draftStopId,
    card,
    clarification,
    createdAt: row.createdAt.toISOString(),
  };
}

export function buildPlanningChatState(input: {
  tripId: string;
  draft: DraftRow | null;
  messages: MessageRow[];
  destinationSummary?: string | null;
}): PlanningChatState {
  const draft = cardFromDraftRow(input.draft);
  if (input.destinationSummary && !draft.destinationSummary) {
    draft.destinationSummary = input.destinationSummary;
  }
  const phase = input.draft?.phase ?? "collecting";
  return {
    tripId: input.tripId,
    phase,
    canSearch: canSearchDraft(draft, phase),
    draft,
    messages: input.messages
      .slice()
      .sort((a, b) => a.position - b.position)
      .map(serializePlanningMessage),
  };
}

export function draftRowDataFromCard(
  card: PlanningDraftCard,
  phase: PlanningPhase,
): {
  phase: PlanningPhase;
  title: string | null;
  concept: PlanningConcept | null;
  tone: string | null;
  originCity: string | null;
  startDate: Date | null;
  endDate: Date | null;
  partySize: number | null;
  selectedStopId: string | null;
  stops: Prisma.InputJsonValue;
} {
  return {
    phase,
    title: card.title ?? null,
    concept: (card.concept as PlanningConcept | null | undefined) ?? null,
    tone: card.tone ?? null,
    originCity: card.originCity ?? null,
    startDate: card.startDate ? new Date(card.startDate) : null,
    endDate: card.endDate ? new Date(card.endDate) : null,
    partySize: card.partySize ?? null,
    selectedStopId: card.selectedStopId ?? null,
    stops: card.stops as Prisma.InputJsonValue,
  };
}

export function tripUpdateFromDraft(card: PlanningDraftCard): {
  title?: string;
  originCity?: string | null;
  destinationSummary?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  partySize?: number;
} {
  const update: {
    title?: string;
    originCity?: string | null;
    destinationSummary?: string | null;
    startDate?: Date | null;
    endDate?: Date | null;
    partySize?: number;
  } = {};

  if (card.title?.trim()) update.title = card.title.trim();
  if (card.originCity !== undefined) update.originCity = card.originCity;
  if (card.destinationSummary !== undefined) {
    update.destinationSummary = card.destinationSummary;
  }
  if (card.startDate) update.startDate = new Date(card.startDate);
  else if (card.startDate === null) update.startDate = null;
  if (card.endDate) update.endDate = new Date(card.endDate);
  else if (card.endDate === null) update.endDate = null;
  if (card.partySize && card.partySize > 0) update.partySize = card.partySize;
  return update;
}

export function textHistoryFromMessages(
  messages: MessageRow[],
): Array<{ role: "user" | "assistant"; content: string }> {
  return messages
    .slice()
    .sort((a, b) => a.position - b.position)
    .filter((row) => row.kind === "text" || row.kind === "clarification")
    .filter((row) => typeof row.body === "string" && row.body.trim().length > 0)
    .map((row) => ({
      role: row.role,
      content: row.body!.trim(),
    }));
}

export function applySelectedStop(
  card: PlanningDraftCard,
  stopId?: string | null,
): PlanningDraftCard {
  if (!stopId) return card;
  if (!card.stops.some((stop) => stop.id === stopId)) return card;
  return { ...card, selectedStopId: stopId };
}

export function mergeSkeletonIntoDraft(
  previous: PlanningDraftCard,
  skeleton: TripSkeleton,
  stopId?: string | null,
): PlanningDraftCard {
  const next = draftCardFromSkeleton(skeleton);
  const selected =
    stopId && next.stops.some((stop) => stop.id === stopId)
      ? stopId
      : previous.selectedStopId && next.stops.some((stop) => stop.id === previous.selectedStopId)
        ? previous.selectedStopId
        : next.selectedStopId;
  return { ...next, selectedStopId: selected ?? next.selectedStopId };
}

export function preferencesFromDraft(
  draft: PlanningDraftCard,
): NonNullable<PlanSkeletonInput["preferences"]> {
  return {
    originCity: draft.originCity ?? undefined,
    destination: draft.destinationSummary ?? undefined,
    startDate: draft.startDate ?? undefined,
    endDate: draft.endDate ?? undefined,
    partySize: draft.partySize ?? undefined,
    budgetTone: draft.budgetTone ?? undefined,
  };
}

export function planningPromptFromDraft(draft: PlanningDraftCard, fallback: string): string {
  const parts = [
    draft.title,
    draft.destinationSummary,
    draft.originCity ? `dari ${draft.originCity}` : null,
    draft.startDate && draft.endDate ? `${draft.startDate} – ${draft.endDate}` : draft.startDate,
    draft.partySize ? `${draft.partySize} orang` : null,
    draft.concept,
    draft.tone,
  ].filter((part): part is string => typeof part === "string" && part.trim().length > 0);
  return parts.length > 0 ? parts.join(", ") : fallback;
}

export {
  canSearchDraft,
  draftCardFromSkeleton,
  draftsEqual,
  emptyDraftCard,
  skeletonFromDraftCard,
  snapshotCard,
};
