import type { PlanSkeletonInput } from "../domain/skeleton.js";
import { SLOT_EXTRACT_PHASE } from "../domain/extract-slots.js";
import { DEFAULT_ORIGIN_CITY } from "../domain/normalize-skeleton.js";

export { SLOT_EXTRACT_PHASE };

export const SLOT_EXTRACT_SYSTEM_PROMPT = `You are Traverior's travel slot extractor (${SLOT_EXTRACT_PHASE} — no itinerary, no tools).

Return ONE JSON object only (no markdown):
{
  "extracted": {
    "destination": string | null,
    "originCity": string | null,
    "startDate": "YYYY-MM-DD" | null,
    "endDate": "YYYY-MM-DD" | null,
    "dateFlexibility": "flexible" | "exact" | null,
    "partySize": number | null,
    "budgetTone": "budget" | "mid" | "luxury" | null,
    "pace": "relaxed" | "moderate" | "packed" | null,
    "travelWith": string | null
  },
  "missing": [
    {
      "id": string,
      "field": string,
      "severity": "required" | "recommended",
      "question": string,
      "input": "date_range" | "text" | "choice" | "number",
      "options": string[] | optional
    }
  ]
}

Rules:
- Extract every travel slot you can from the user prompt. Resolve relative and natural-language dates using Today from the user message.
  Example: "3 hari di hari pertama bulan kedua tahun ini" → ISO start/end (if that start is already in the past, roll to the next year).
- Never invent a destination, city, or calendar date the user did not imply.
- Copy already-known structured preferences; do not list those fields in missing.
- missing[] is only what the client still needs to confirm. Use camelCase field names the client can send back in preferences (destination, startDate, endDate, dateFlexibility, originCity, partySize, budgetTone, pace, travelWith) or another short camelCase name for extra slots (dietary, visa, etc.).
- severity required = cannot plan a coherent trip: unknown destination, or unknown travel time with no flexibility.
- If you extracted startDate or dateFlexibility=flexible, do not mark dates as missing.
- partySize, budget, pace, origin, travelWith: recommended when unknown. partySize is NOT required (default 1).
- If the user says timing is flexible, set dateFlexibility=flexible.
- Questions in the same language as the user prompt. JSON keys in English.`;

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
      "countryCode": "SG" | "JP" | ISO-2 | optional,
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
- originCity is the traveler's departure/home airport city, never a destination.
- If the user names a departure city in the prompt, set originCity to that city (this overrides preferences).
- If they do not name a departure city, set originCity from preferences.originCity when present.
- If both are missing, OMIT originCity. Do not invent a city (including ${DEFAULT_ORIGIN_CITY}).
- The app will add departure and return hub nodes automatically from originCity; focus checkpoints on destinations.
- Do NOT invent prices, durations in minutes, distances, or live availability.
- Prefer 2–5 checkpoints. First checkpoint that needs an inbound flight should include "flights".
- Every STAY should usually include hotels + places; include weather/routes/events/visa/checklist when relevant.
- If dates are missing, OMIT assumedStartDate/assumedEndDate. Do not invent calendar dates.
- If the user names dates, a month, or a holiday window, set assumedStartDate/assumedEndDate from that.
- Follow the destination named in the user prompt. Do not substitute Japan or any other country.
- If Japan is the destination, Tokyo / Kyoto / Osaka style routing is fine.
- Respond in the same language as the user prompt for title/summary/notes; keep JSON keys in English.`;

export function buildSlotExtractUserPrompt(input: {
  prompt: string;
  preferences?: PlanSkeletonInput["preferences"];
  today: Date;
}): string {
  const todayIso = input.today.toISOString().slice(0, 10);
  return [
    `Today: ${todayIso}`,
    "",
    "User prompt:",
    input.prompt.trim(),
    "",
    "Already-known structured preferences (treat these as answered; do not ask again):",
    JSON.stringify(input.preferences ?? {}, null, 2),
    "",
    "Extract slots and list only remaining missing fields.",
  ].join("\n");
}

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
