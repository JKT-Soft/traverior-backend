import type { PlanSkeletonInput, SkeletonCheckpoint, TripSkeleton } from "./skeleton.js";

/** Default hub when the user does not specify a home city (Traverior primary market). */
export const DEFAULT_ORIGIN_CITY = "Jakarta";

export type NormalizeSkeletonOptions = {
  tripOriginCity?: string | null;
  preferences?: PlanSkeletonInput["preferences"];
};

function citiesEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function resolveOriginCity(
  skeleton: TripSkeleton,
  options: NormalizeSkeletonOptions = {},
): string {
  return (
    skeleton.originCity?.trim() ||
    options.preferences?.originCity?.trim() ||
    options.tripOriginCity?.trim() ||
    DEFAULT_ORIGIN_CITY
  );
}

function ensureNeed(checkpoint: SkeletonCheckpoint, need: SkeletonCheckpoint["needs"][number]) {
  if (checkpoint.needs.includes(need)) return checkpoint;
  return { ...checkpoint, needs: [need, ...checkpoint.needs] };
}

/**
 * Ensure skeleton has a resolved home hub and destination-only checkpoints.
 * Origin/return pipeline nodes are added later in persist-plan.
 */
export function normalizeTripSkeleton(
  skeleton: TripSkeleton,
  options: NormalizeSkeletonOptions = {},
): TripSkeleton {
  const originCity = resolveOriginCity(skeleton, options);
  let checkpoints = [...skeleton.checkpoints];

  while (
    checkpoints.length > 1 &&
    citiesEqual(checkpoints[checkpoints.length - 1]!.city, originCity)
  ) {
    checkpoints.pop();
  }

  while (checkpoints.length > 1 && citiesEqual(checkpoints[0]!.city, originCity)) {
    checkpoints.shift();
  }

  if (checkpoints.length > 0) {
    const first = checkpoints[0]!;
    if (!citiesEqual(first.city, originCity)) {
      checkpoints[0] = ensureNeed(first, "flights");
    }

    const lastIdx = checkpoints.length - 1;
    checkpoints[lastIdx] = ensureNeed(checkpoints[lastIdx]!, "flights");
  }

  return {
    ...skeleton,
    originCity,
    checkpoints,
  };
}
