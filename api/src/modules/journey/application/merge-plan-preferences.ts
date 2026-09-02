import type { PlanSkeletonInput } from "../../planner/domain/skeleton.js";

export type StoredTravelPreference = {
  budgetStyle?: "budget" | "balanced" | "luxury";
  pace?: "relaxed" | "moderate" | "packed";
  extra?: unknown;
};

export function extraString(extra: unknown, key: string): string | undefined {
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return undefined;
  const value = (extra as Record<string, unknown>)[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function budgetStyleToTone(
  style: StoredTravelPreference["budgetStyle"] | undefined,
): "budget" | "mid" | "luxury" | undefined {
  if (style === "budget") return "budget";
  if (style === "luxury") return "luxury";
  if (style === "balanced") return "mid";
  return undefined;
}

/**
 * Request fields override stored profile preferences.
 * Prompt-extracted origin is applied later by the LLM / normalizeTripSkeleton.
 */
export function mergePlanPreferences(input: {
  stored?: StoredTravelPreference | null;
  request?: PlanSkeletonInput["preferences"];
  tripOriginCity?: string | null;
}): NonNullable<PlanSkeletonInput["preferences"]> {
  const storedOrigin = extraString(input.stored?.extra, "originCity");
  const storedPassport = extraString(input.stored?.extra, "passportCountry");
  const request = input.request ?? {};
  const tripOrigin = input.tripOriginCity?.trim() || undefined;

  return {
    originCity: request.originCity?.trim() || storedOrigin || tripOrigin,
    startDate: request.startDate,
    endDate: request.endDate,
    partySize: request.partySize,
    budgetTone: request.budgetTone ?? budgetStyleToTone(input.stored?.budgetStyle),
    pace: request.pace ?? input.stored?.pace,
    passportCountry: request.passportCountry?.trim() || storedPassport,
  };
}
