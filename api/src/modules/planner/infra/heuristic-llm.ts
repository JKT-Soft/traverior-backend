import type { LlmClient, LlmJsonRequest } from "../domain/ports.js";
import { SLOT_EXTRACT_PHASE, parseNaturalLanguageDates } from "../domain/extract-slots.js";
import type { SlotExtraction } from "../domain/extract-slots.js";
import type { SkeletonCheckpoint, TripSkeleton } from "../domain/skeleton.js";

type DestinationPlan = {
  title: string;
  summary: string;
  destinationSummary: string;
  checkpoints: SkeletonCheckpoint[];
};

const JAPAN_PLAN: DestinationPlan = {
  title: "Japan peak-season loop",
  summary: "Heuristic skeleton for popular Japan cities with an affordable mid-length stay.",
  destinationSummary: "Tokyo → Kyoto → Osaka",
  checkpoints: [
    {
      city: "Tokyo",
      countryCode: "JP",
      role: "STAY",
      days: 3,
      needs: ["flights", "hotels", "places", "routes", "weather", "visa", "checklist"],
      notes: "Arrival + city base",
    },
    {
      city: "Kyoto",
      countryCode: "JP",
      role: "STAY",
      days: 3,
      needs: ["hotels", "places", "routes", "events", "weather"],
      notes: "Temples / culture",
    },
    {
      city: "Osaka",
      countryCode: "JP",
      role: "STAY",
      days: 2,
      needs: ["hotels", "places", "routes", "events", "weather", "flights"],
      notes: "Food + return flight home",
    },
  ],
};

const DESTINATION_PRESETS: Array<{ test: RegExp; plan: DestinationPlan }> = [
  {
    test: /\b(japan|jepang|tokyo|osaka|kyoto|hokkaido)\b|大阪|東京/i,
    plan: JAPAN_PLAN,
  },
  {
    test: /\b(singapore|singapura)\b/i,
    plan: cityPlan("Singapore", "SG", "Singapore getaway"),
  },
  {
    test: /\b(bali|ubud|denpasar|seminyak)\b/i,
    plan: cityPlan("Bali", "ID", "Bali escape"),
  },
  {
    test: /\b(thailand|bangkok|phuket|chiang mai)\b/i,
    plan: cityPlan("Bangkok", "TH", "Thailand trip"),
  },
  {
    test: /\b(korea|seoul|busan)\b/i,
    plan: cityPlan("Seoul", "KR", "Korea trip"),
  },
  {
    test: /\b(taiwan|taipei)\b/i,
    plan: cityPlan("Taipei", "TW", "Taiwan trip"),
  },
  {
    test: /\b(malaysia|kuala lumpur|kl)\b/i,
    plan: cityPlan("Kuala Lumpur", "MY", "Malaysia trip"),
  },
];

function cityPlan(city: string, countryCode: string, title: string): DestinationPlan {
  return {
    title,
    summary: `Heuristic skeleton for ${city}.`,
    destinationSummary: city,
    checkpoints: [
      {
        city,
        countryCode,
        role: "STAY",
        days: 5,
        needs: ["flights", "hotels", "places", "weather", "checklist"],
      },
    ],
  };
}

function inferDestination(user: string): DestinationPlan {
  for (const preset of DESTINATION_PRESETS) {
    if (preset.test.test(user)) return preset.plan;
  }

  const named = user.match(
    /\b(?:ke|to|in|di)\s+([A-Za-z][A-Za-z][A-Za-z\s-]{0,32}?)(?=\s+(?:selama|for|during|dengan|with|dari|from)\b|[.,!?\n]|$)/i,
  );
  const city = named?.[1]?.trim();
  if (city && city.length >= 2 && !/^(the|a|an|yang|tempat)$/i.test(city)) {
    const label = city.replace(/\s+/g, " ");
    return cityPlan(titleCase(label), "XX", `${titleCase(label)} trip`);
  }

  return {
    title: "Short trip",
    summary: "Heuristic generic skeleton from prompt cues.",
    destinationSummary: "Primary destination",
    checkpoints: [
      {
        city: "Destination",
        countryCode: "XX",
        role: "STAY",
        days: 5,
        needs: ["flights", "hotels", "places", "weather", "checklist"],
      },
    ],
  };
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Deterministic fallback when OPENAI_API_KEY is missing (local/dev/tests).
 * Parses light cues from the user message; not a substitute for real LLM quality.
 */
export class HeuristicLlmClient implements LlmClient {
  readonly name = "heuristic";

  async completeJson(request: LlmJsonRequest): Promise<string> {
    const system = request.messages.find((m) => m.role === "system")?.content ?? "";
    const user = [...request.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    if (system.includes(SLOT_EXTRACT_PHASE)) {
      return JSON.stringify(heuristicSlotExtraction(user));
    }

    const lower = user.toLowerCase();

    const partyMatch = user.match(/partySize["']?\s*:\s*(\d+)/i);
    const partySize = partyMatch ? Number(partyMatch[1]) : 1;

    const budgetTone = lower.includes("luxury") || lower.includes("mewah")
      ? "luxury"
      : lower.includes("affordable") ||
          lower.includes("budget") ||
          lower.includes("hemat") ||
          lower.includes("murah")
        ? "budget"
        : "mid";

    const originCity =
      pickPref(user, "originCity") ??
      (/\b(?:dari|from)\s+jakarta\b|\bcgk\b/i.test(user) ? "Jakarta" : undefined) ??
      (/\b(?:dari|from)\s+surabaya\b|\bsub\b/i.test(user) ? "Surabaya" : undefined);

    const startDate = pickPref(user, "startDate") ?? isoDateIn(user);
    const endDate = pickPref(user, "endDate") ?? undefined;
    const destination = inferDestination(user);

    const skeleton: TripSkeleton = {
      title: destination.title,
      summary: destination.summary,
      originCity,
      destinationSummary: destination.destinationSummary,
      assumedStartDate: startDate,
      assumedEndDate: endDate,
      partySize,
      budgetTone,
      checkpoints: destination.checkpoints,
    };

    return JSON.stringify(skeleton);
  }
}

function pickPref(blob: string, key: string): string | undefined {
  const re = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`, "i");
  const m = blob.match(re);
  return m?.[1];
}

function isoDateIn(blob: string): string | undefined {
  const match = blob.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  return match?.[1];
}

function heuristicSlotExtraction(user: string): SlotExtraction {
  const body = user.replace(/Today:\s*\d{4}-\d{2}-\d{2}/gi, "");
  const todayMatch = user.match(/Today:\s*(\d{4}-\d{2}-\d{2})/i);
  const today = todayMatch?.[1] ? new Date(`${todayMatch[1]}T00:00:00Z`) : new Date();
  const destinationPref = pickPref(user, "destination");
  const originPref = pickPref(user, "originCity");
  const startPref = pickPref(user, "startDate");
  const endPref = pickPref(user, "endDate");
  const flexibilityPref = pickPref(user, "dateFlexibility");
  const inferred = inferDestination(body);
  const destinationName =
    destinationPref ??
    (inferred.checkpoints[0]?.city && inferred.checkpoints[0].city !== "Destination"
      ? inferred.destinationSummary
      : undefined);
  const naturalDates = parseNaturalLanguageDates(body, today);
  const startDate = startPref ?? naturalDates.startDate ?? isoDateIn(body);
  const endDate = endPref ?? naturalDates.endDate;
  const dateFlexibility =
    flexibilityPref === "flexible" || flexibilityPref === "exact"
      ? flexibilityPref
      : /\b(fleksibel|flexible|kapan saja|anytime)\b/i.test(body)
        ? "flexible"
        : undefined;
  const originCity =
    originPref ??
    (/\b(?:dari|from)\s+jakarta\b|\bcgk\b/i.test(body) ? "Jakarta" : undefined) ??
    (/\b(?:dari|from)\s+surabaya\b|\bsub\b/i.test(body) ? "Surabaya" : undefined);
  const partyMatch = body.match(/(\d+)\s*(?:orang|people|persons|pax|travelers?)/i);
  const partyPref = user.match(/partySize["']?\s*:\s*(\d+)/i);
  const partySize = partyPref ? Number(partyPref[1]) : partyMatch ? Number(partyMatch[1]) : undefined;

  const missing: SlotExtraction["missing"] = [];
  if (!destinationName) {
    missing.push({
      id: "destination",
      field: "destination",
      severity: "required",
      question: "Where do you want to go?",
      input: "text",
    });
  }
  if (!startDate) {
    missing.push({
      id: "dates",
      field: "startDate",
      severity: "required",
      question: "When do you want to go? Pick a start and end date.",
      input: "date_range",
    });
  }
  if (!originCity) {
    missing.push({
      id: "originCity",
      field: "originCity",
      severity: "recommended",
      question: "Which city are you departing from?",
      input: "text",
    });
  }
  if (!partySize) {
    missing.push({
      id: "partySize",
      field: "partySize",
      severity: "recommended",
      question: "How many people are traveling?",
      input: "number",
    });
  }

  return {
    extracted: {
      destination: destinationName ?? null,
      originCity: originCity ?? null,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      dateFlexibility: dateFlexibility ?? null,
      partySize: partySize ?? null,
    },
    missing,
  };
}
