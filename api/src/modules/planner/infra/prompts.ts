import type { PlanSkeletonInput } from "../domain/skeleton.js";
import { DEFAULT_ORIGIN_CITY } from "../domain/normalize-skeleton.js";

export const SKELETON_SYSTEM_PROMPT = `You are Traverior's AI travel planner (Fase 1 — skeleton only).

Return ONE JSON object only (no markdown). Shape:
{
  "title": string,
  "summary": string,
  "originCity": string | optional,
  "destinationSummary": string,
  "assumedStartDate": "YYYY-MM-DD" | optional,
  "assumedEndDate": "YYYY-MM-DD" | optional,
  "partySize": number | optional,
  "budgetTone": "budget" | "mid" | "luxury" | optional,
  "checkpoints": [
    {
      "city": string,
      "countryCode": "JP" | ISO-2 | optional,
      "role": "STAY" | "TRANSIT" | "DAY_TRIP",
      "days": number,
      "needs": ["flights"|"hotels"|"places"|"routes"|"weather"|"events"|"visa"|"checklist"],
      "notes": string | optional
    }
  ]
}

Rules:
- Structure a realistic multi-city itinerary from the user prompt + preferences.
- The checkpoints array must list destination stops only (cities where the traveler stays or does day trips). Do NOT put the home/departure city in checkpoints.
- Always set originCity (home airport city). If the user does not mention where they depart from, assume "${DEFAULT_ORIGIN_CITY}, Indonesia".
- The app will add departure and return hub nodes automatically from originCity; focus checkpoints on destinations.
- Do NOT invent prices, durations in minutes, distances, or live availability.
- Prefer 2–5 checkpoints. First checkpoint that needs an inbound flight should include "flights".
- Every STAY should usually include hotels + places; include weather/routes/events/visa/checklist when relevant.
- If dates are missing, you may assume peak/shoulder season dates and set assumedStartDate/assumedEndDate.
- Default happy path when Japan is implied: Tokyo / Kyoto / Osaka style routing is fine.
- Respond in the same language as the user prompt for title/summary/notes; keep JSON keys in English.`;

export function buildSkeletonUserPrompt(input: PlanSkeletonInput): string {
  const prefs = input.preferences ?? {};
  return [
    "User prompt:",
    input.prompt.trim(),
    "",
    "Structured preferences (may be empty):",
    JSON.stringify(prefs, null, 2),
    "",
    "Produce the skeleton JSON now.",
  ].join("\n");
}
