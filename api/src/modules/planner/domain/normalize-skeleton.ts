import type { PlanSkeletonInput, SkeletonCheckpoint, TripSkeleton } from "./skeleton.js";

/** Default hub when the user does not specify a home city (Traverior primary market). */
export const DEFAULT_ORIGIN_CITY = "Jakarta";

const PRIMARY_AIRPORT_BY_CITY: Record<string, string> = {
  amsterdam: "AMS",
  bangkok: "BKK",
  barcelona: "BCN",
  beijing: "PEK",
  cebu: "CEB",
  denpasar: "DPS",
  dubai: "DXB",
  hongkong: "HKG",
  jakarta: "CGK",
  kualalumpur: "KUL",
  kyoto: "KIX",
  london: "LHR",
  madrid: "MAD",
  manila: "MNL",
  melbourne: "MEL",
  osaka: "KIX",
  paris: "CDG",
  rome: "FCO",
  seoul: "ICN",
  singapore: "SIN",
  sydney: "SYD",
  taipe: "TPE",
  taipei: "TPE",
  tokyo: "NRT",
};

export type NormalizeSkeletonOptions = {
  tripOriginCity?: string | null;
  preferences?: PlanSkeletonInput["preferences"];
};

function citiesEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function resolvePrimaryAirportIata(city: string): string | undefined {
  const key = city.toLowerCase().replace(/[^a-z]/g, "");
  return PRIMARY_AIRPORT_BY_CITY[key];
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
 * Always attach flights on first (outbound) and last (return). Also ensure
 * flights when consecutive destinations change countryCode (cross-border hop).
 * Same-country island hops rely on the LLM skeleton needs (see prompt).
 */
export function normalizeTripSkeleton(
  skeleton: TripSkeleton,
  options: NormalizeSkeletonOptions = {},
): TripSkeleton {
  const originCity = resolveOriginCity(skeleton, options);
  let checkpoints = [...skeleton.checkpoints];
  checkpoints = checkpoints.map((checkpoint) => ({
    ...checkpoint,
    airportIata:
      checkpoint.airportIata?.toUpperCase() ??
      resolvePrimaryAirportIata(checkpoint.city),
  }));

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

    for (let i = 1; i < checkpoints.length; i++) {
      const prev = checkpoints[i - 1]!;
      const curr = checkpoints[i]!;
      const prevCc = prev.countryCode?.trim().toUpperCase();
      const currCc = curr.countryCode?.trim().toUpperCase();
      if (prevCc && currCc && prevCc !== currCc) {
        checkpoints[i] = ensureNeed(curr, "flights");
      }
    }

    const lastIdx = checkpoints.length - 1;
    checkpoints[lastIdx] = ensureNeed(checkpoints[lastIdx]!, "flights");
  }

  return {
    ...skeleton,
    originCity,
    originIata:
      skeleton.originIata?.toUpperCase() ?? resolvePrimaryAirportIata(originCity),
    checkpoints,
  };
}
