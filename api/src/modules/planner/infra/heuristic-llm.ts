import type { LlmClient, LlmJsonRequest } from "../domain/ports.js";
import type { TripSkeleton } from "../domain/skeleton.js";

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
      (/\bjakarta\b|cgk\b/i.test(user) ? "Jakarta" : undefined) ??
      (/\bsurabaya\b|sub\b/i.test(user) ? "Surabaya" : undefined) ??
      "Jakarta";

    const startDate = pickPref(user, "startDate") ?? "2026-10-01";
    const endDate = pickPref(user, "endDate") ?? "2026-10-10";

    const wantsJapan =
      /japan|jepang|tokyo|osaka|kyoto|hokkaido|osaka|大阪|東京/i.test(user) ||
      !/thailand|bali|korea|singapore|singapore|taiwan/i.test(user);

    const skeleton: TripSkeleton = wantsJapan
      ? {
          title: "Japan peak-season loop",
          summary:
            "Heuristic skeleton for popular Japan cities with an affordable mid-length stay.",
          originCity,
          destinationSummary: "Tokyo → Kyoto → Osaka",
          assumedStartDate: startDate,
          assumedEndDate: endDate,
          partySize,
          budgetTone,
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
        }
      : {
          title: "Short multi-city trip",
          summary: "Heuristic generic skeleton from prompt cues.",
          originCity,
          destinationSummary: "Primary destination",
          assumedStartDate: startDate,
          assumedEndDate: endDate,
          partySize,
          budgetTone,
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

    return JSON.stringify(skeleton);
  }
}

function pickPref(blob: string, key: string): string | undefined {
  const re = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`, "i");
  const m = blob.match(re);
  return m?.[1];
}
