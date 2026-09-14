export type PlanClarification = {
  id: string;
  field: string;
  severity: "required" | "recommended";
  question: string;
  input: "date_range" | "text" | "choice" | "number";
  options?: string[];
};

export type PlanClarificationInput = {
  prompt: string;
  preferences?: {
    originCity?: string;
    destination?: string;
    startDate?: string;
    endDate?: string;
    dateFlexibility?: "flexible" | "exact";
    partySize?: number;
  };
  context?: {
    departureDate?: string;
    returnDate?: string;
    checkIn?: string;
    checkOut?: string;
  };
  trip?: {
    startDate?: Date | string | null;
    endDate?: Date | string | null;
    originCity?: string | null;
  };
};

export function toIsoDate(value: Date | string | null | undefined): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
    return undefined;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return undefined;
}

export function resolvePlanDates(
  input: PlanClarificationInput & {
    assumedStartDate?: string | null;
    assumedEndDate?: string | null;
  },
): {
  mode: "flexible" | "exact" | "unspecified";
  start?: string;
  end?: string;
} {
  const explicitStart =
    toIsoDate(input.preferences?.startDate) ??
    toIsoDate(input.context?.departureDate) ??
    toIsoDate(input.context?.checkIn) ??
    toIsoDate(input.trip?.startDate);
  const explicitEnd =
    toIsoDate(input.preferences?.endDate) ??
    toIsoDate(input.context?.returnDate) ??
    toIsoDate(input.context?.checkOut) ??
    toIsoDate(input.trip?.endDate);

  if (explicitStart) {
    return {
      mode: input.preferences?.dateFlexibility === "flexible" ? "flexible" : "exact",
      start: explicitStart,
      end: explicitEnd ?? explicitStart,
    };
  }

  // Flexible without a concrete window stays undated — caller must ask the user.
  if (input.preferences?.dateFlexibility === "flexible") {
    return { mode: "flexible" };
  }

  const assumedStart = toIsoDate(input.assumedStartDate);
  if (assumedStart) {
    return {
      mode: "exact",
      start: assumedStart,
      end: toIsoDate(input.assumedEndDate) ?? assumedStart,
    };
  }

  return { mode: "unspecified" };
}
