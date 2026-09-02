import type { LlmClient, LlmJsonRequest } from "../domain/ports.js";
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
      notes: "Food + departure hub",
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
    const user = [...request.messages].reverse().find((m) => m.role === "user")?.content ?? "";
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

    const startDate = pickPref(user, "startDate") ?? "2026-10-01";
    const endDate = pickPref(user, "endDate") ?? "2026-10-10";
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
