import { z } from "zod";
import type { PlanClarification } from "./clarifications.js";
import { toIsoDate } from "./clarifications.js";
import type { PlanSkeletonInput } from "./skeleton.js";

export const SLOT_EXTRACT_PHASE = "Fase 0 — slot extraction";

export const PlanClarificationSchema = z.object({
  id: z.string().min(1),
  field: z.string().min(1),
  severity: z.enum(["required", "recommended"]),
  question: z.string().min(1),
  input: z.enum(["date_range", "text", "choice", "number"]),
  options: z.array(z.string()).optional(),
});

export const ExtractedPlanSlotsSchema = z.object({
  destination: z.string().min(1).nullable().optional(),
  originCity: z.string().min(1).nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  dateFlexibility: z.enum(["flexible", "exact"]).nullable().optional(),
  partySize: z.number().int().positive().max(20).nullable().optional(),
  budgetTone: z.enum(["budget", "mid", "luxury"]).nullable().optional(),
  pace: z.enum(["relaxed", "moderate", "packed"]).nullable().optional(),
  travelWith: z.string().min(1).nullable().optional(),
});

export const SlotExtractionSchema = z.object({
  extracted: ExtractedPlanSlotsSchema.default({}),
  missing: z.array(PlanClarificationSchema).default([]),
});

export type ExtractedPlanSlots = z.infer<typeof ExtractedPlanSlotsSchema>;
export type SlotExtraction = z.infer<typeof SlotExtractionSchema>;

const EMPTY_VALUE = new Set(["", "null", "undefined", "unknown", "n/a", "none"]);

function cleanString(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || EMPTY_VALUE.has(trimmed.toLowerCase())) return undefined;
  return trimmed;
}

function cleanIso(value: string | null | undefined): string | undefined {
  return toIsoDate(cleanString(value) ?? null);
}

export function mergeExtractedPreferences(
  base: NonNullable<PlanSkeletonInput["preferences"]>,
  extracted: ExtractedPlanSlots,
): NonNullable<PlanSkeletonInput["preferences"]> {
  return {
    ...base,
    destination: base.destination ?? cleanString(extracted.destination),
    originCity: base.originCity ?? cleanString(extracted.originCity),
    startDate: base.startDate ?? cleanIso(extracted.startDate),
    endDate: base.endDate ?? cleanIso(extracted.endDate),
    dateFlexibility: base.dateFlexibility ?? extracted.dateFlexibility ?? undefined,
    partySize: base.partySize ?? extracted.partySize ?? undefined,
    budgetTone: base.budgetTone ?? extracted.budgetTone ?? undefined,
    pace: base.pace ?? extracted.pace ?? undefined,
    travelWith: base.travelWith ?? cleanString(extracted.travelWith),
  };
}

export function applyPlanAnswers(
  base: NonNullable<PlanSkeletonInput["preferences"]>,
  answers?: Record<string, unknown>,
): NonNullable<PlanSkeletonInput["preferences"]> {
  if (!answers) return base;
  const numberish = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
    return undefined;
  };
  return {
    ...base,
    destination: base.destination ?? cleanString(typeof answers.destination === "string" ? answers.destination : undefined),
    originCity: base.originCity ?? cleanString(typeof answers.originCity === "string" ? answers.originCity : undefined),
    startDate: base.startDate ?? cleanIso(typeof answers.startDate === "string" ? answers.startDate : undefined),
    endDate: base.endDate ?? cleanIso(typeof answers.endDate === "string" ? answers.endDate : undefined),
    dateFlexibility:
      base.dateFlexibility ??
      (answers.dateFlexibility === "flexible" || answers.dateFlexibility === "exact"
        ? answers.dateFlexibility
        : undefined),
    partySize: base.partySize ?? numberish(answers.partySize),
    budgetTone:
      base.budgetTone ??
      (answers.budgetTone === "budget" || answers.budgetTone === "mid" || answers.budgetTone === "luxury"
        ? answers.budgetTone
        : undefined),
    pace:
      base.pace ??
      (answers.pace === "relaxed" || answers.pace === "moderate" || answers.pace === "packed"
        ? answers.pace
        : undefined),
    travelWith: base.travelWith ?? cleanString(typeof answers.travelWith === "string" ? answers.travelWith : undefined),
  };
}

const DATE_FIELDS = new Set(["startDate", "endDate", "dates", "dateFlexibility"]);

function hasAnsweredValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return cleanString(value) != null;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  return true;
}

/** Concrete calendar dates are required so flights/hotels/budget can run. Flexible alone is not enough. */
export function hasConcreteTravelDates(
  preferences: NonNullable<PlanSkeletonInput["preferences"]>,
  answers?: Record<string, unknown>,
): boolean {
  return Boolean(
    cleanIso(preferences.startDate) ||
      cleanIso(typeof answers?.startDate === "string" ? answers.startDate : undefined),
  );
}

export function requiredTravelDateClarification(): PlanClarification {
  return {
    id: "dates",
    field: "startDate",
    severity: "required",
    question: "When do you want to go? Pick a start and end date.",
    input: "date_range",
  };
}

export function filterResolvedClarifications(
  missing: PlanClarification[],
  preferences: NonNullable<PlanSkeletonInput["preferences"]>,
  answers?: Record<string, unknown>,
): PlanClarification[] {
  const datesResolved = hasConcreteTravelDates(preferences, answers);

  return missing.filter((item) => {
    if (DATE_FIELDS.has(item.field) || DATE_FIELDS.has(item.id)) {
      return !datesResolved;
    }
    const key = item.field as keyof NonNullable<PlanSkeletonInput["preferences"]>;
    const value = preferences[key];
    if (hasAnsweredValue(value) || hasAnsweredValue(answers?.[item.field]) || hasAnsweredValue(answers?.[item.id])) {
      return false;
    }
    return true;
  });
}

export function publicExtractedSlots(
  preferences: NonNullable<PlanSkeletonInput["preferences"]>,
): Record<string, unknown> {
  const extracted: Record<string, unknown> = {};
  const keys = [
    "destination",
    "originCity",
    "startDate",
    "endDate",
    "dateFlexibility",
    "partySize",
    "budgetTone",
    "pace",
    "travelWith",
  ] as const;
  for (const key of keys) {
    const value = preferences[key];
    if (hasAnsweredValue(value)) extracted[key] = value;
  }
  return extracted;
}

export function ensureCriticalClarifications(
  missing: PlanClarification[],
  preferences: NonNullable<PlanSkeletonInput["preferences"]>,
): PlanClarification[] {
  const next = [...missing];
  if (!preferences.destination?.trim() && !next.some((item) => item.field === "destination" || item.id === "destination")) {
    next.push({
      id: "destination",
      field: "destination",
      severity: "required",
      question: "Where do you want to go?",
      input: "text",
    });
  }
  if (
    !hasConcreteTravelDates(preferences) &&
    !next.some((item) => DATE_FIELDS.has(item.field) || DATE_FIELDS.has(item.id))
  ) {
    next.push(requiredTravelDateClarification());
  }
  return next;
}

const ORDINALS: Record<string, number> = {
  pertama: 1,
  kedua: 2,
  ketiga: 3,
  keempat: 4,
  kelima: 5,
  keenam: 6,
  ketujuh: 7,
  kedelapan: 8,
  kesembilan: 9,
  kesepuluh: 10,
  kesebelas: 11,
  keduabelas: 12,
  "kedua belas": 12,
};

const MONTHS: Record<string, number> = {
  januari: 1,
  february: 2,
  februari: 2,
  maret: 3,
  march: 3,
  april: 4,
  mei: 5,
  may: 5,
  juni: 6,
  june: 6,
  juli: 7,
  july: 7,
  agustus: 8,
  august: 8,
  september: 9,
  oktober: 10,
  october: 10,
  november: 11,
  desember: 12,
  december: 12,
};

function parseOrdinalOrNumber(value: string): number | undefined {
  const trimmed = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (ORDINALS[trimmed]) return ORDINALS[trimmed];
  if (MONTHS[trimmed]) return MONTHS[trimmed];
  const ke = trimmed.match(/^ke-?(\d+)$/);
  if (ke) return Number(ke[1]);
  if (/^\d{1,2}$/.test(trimmed)) return Number(trimmed);
  return undefined;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isoFromParts(year: number, month: number, day: number): string | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return undefined;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function todayIso(today: Date): string {
  return `${today.getUTCFullYear()}-${pad2(today.getUTCMonth() + 1)}-${pad2(today.getUTCDate())}`;
}

export function parseNaturalLanguageDates(
  prompt: string,
  today: Date,
): { startDate?: string; endDate?: string } {
  const durationMatch = prompt.match(/(\d+)\s*hari/i);
  const durationDays = durationMatch ? Number(durationMatch[1]) : undefined;
  const searchable = prompt.replace(/Today:\s*\d{4}-\d{2}-\d{2}/gi, "");

  const relative = searchable.match(
    /hari\s+([A-Za-z0-9-]+(?:\s+belas)?)\s+bulan\s+([A-Za-z0-9-]+(?:\s+belas)?)\s+tahun\s+(ini|depan|\d{4})/i,
  );
  if (!relative) {
    const iso = searchable.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (!iso?.[1]) return {};
    const startDate = iso[1];
    return {
      startDate,
      endDate: durationDays ? addDaysIso(startDate, durationDays - 1) : undefined,
    };
  }

  const day = parseOrdinalOrNumber(relative[1] ?? "");
  const month = parseOrdinalOrNumber(relative[2] ?? "");
  const yearToken = (relative[3] ?? "").toLowerCase();
  if (!day || !month) return {};

  let year =
    yearToken === "ini"
      ? today.getUTCFullYear()
      : yearToken === "depan"
        ? today.getUTCFullYear() + 1
        : Number(yearToken);
  let startDate = isoFromParts(year, month, day);
  if (!startDate) return {};

  if (startDate < todayIso(today) && (yearToken === "ini" || yearToken === "depan")) {
    year += 1;
    startDate = isoFromParts(year, month, day);
    if (!startDate) return {};
  }

  return {
    startDate,
    endDate: durationDays ? addDaysIso(startDate, durationDays - 1) : startDate,
  };
}

export function splitClarifications(missing: PlanClarification[]): {
  required: PlanClarification[];
  recommended: PlanClarification[];
} {
  return {
    required: missing.filter((item) => item.severity === "required"),
    recommended: missing.filter((item) => item.severity !== "required"),
  };
}
