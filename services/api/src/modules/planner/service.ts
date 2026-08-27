import { AppError, ValidationError } from "../../shared/http/errors.js";
import type { LlmClient } from "./domain/ports.js";
import {
  TripSkeletonSchema,
  type PlanSkeletonInput,
  type TripSkeleton,
} from "./domain/skeleton.js";
import type { FlightService } from "../flights/application/service.js";
import type { HotelService } from "../hotels/application/service.js";
import type { PlaceService } from "../places/application/service.js";
import type { RouteService } from "../routes/application/service.js";
import type { WeatherService } from "../weather/application/service.js";
import type { EventService } from "../events/application/service.js";
import type { VisaService } from "../visa/application/service.js";
import type { ChecklistService } from "../checklist/application/service.js";
import { buildSkeletonUserPrompt, SKELETON_SYSTEM_PROMPT } from "./infra/prompts.js";

export type PlannerDeps = {
  llm: LlmClient;
  flights: FlightService;
  hotels: HotelService;
  places: PlaceService;
  routes: RouteService;
  weather: WeatherService;
  events: EventService;
  visa: VisaService;
  checklist: ChecklistService;
};

/**
 * AI Planner: Fase 1 = LLM skeleton (no tools).
 * enrichCity remains deterministic domain enrichment (pre-MCP path).
 */
export class PlannerService {
  constructor(private readonly deps: PlannerDeps) {}

  get llmName(): string {
    return this.deps.llm.name;
  }

  /**
   * Fase 1 — natural language → trip skeleton JSON (checkpoints + needs).
   * Does not call MCP/providers and must not invent live prices.
   */
  async planSkeleton(input: PlanSkeletonInput): Promise<{
    skeleton: TripSkeleton;
    llm: string;
  }> {
    const prompt = input.prompt?.trim();
    if (!prompt) throw new ValidationError("prompt is required");
    
    console.log("=======================================================");
    console.log(input);

    const raw = await this.deps.llm.completeJson({
      temperature: 0.3,
      maxTokens: 1200,
      messages: [
        { role: "system", content: SKELETON_SYSTEM_PROMPT },
        { role: "user", content: buildSkeletonUserPrompt({ ...input, prompt }) },
      ],
    });
    
    console.log("=======================================================");
    console.log(raw);

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripCodeFence(raw));
    } catch {
      throw new AppError(502, "LLM returned invalid JSON", "LLM_INVALID_JSON");
    }

    const skeleton = TripSkeletonSchema.safeParse(parsed);
    if (!skeleton.success) {
      throw new AppError(
        502,
        `LLM skeleton failed validation: ${skeleton.error.issues[0]?.message ?? "invalid"}`,
        "LLM_INVALID_SKELETON",
      );
    }

    return { skeleton: skeleton.data, llm: this.deps.llm.name };
  }

  async enrichCity(input: {
    city: string;
    countryCode?: string;
    checkIn: string;
    checkOut: string;
    originLat?: number;
    originLng?: number;
    destLat?: number;
    destLng?: number;
    passportCountry?: string;
    destinationCountry?: string;
  }) {
    const [hotels, restaurants, events, weather, visa] = await Promise.all([
      this.deps.hotels.search({
        cityName: input.city,
        countryCode: input.countryCode,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
      }),
      this.deps.places.searchRestaurants(input.city),
      this.deps.events.search({ city: input.city, includeFree: true, includePaid: true }),
      input.destLat != null && input.destLng != null
        ? this.deps.weather.getForecast({ lat: input.destLat, lon: input.destLng })
        : Promise.resolve(null),
      this.deps.visa.getRequirements({
        passportCountry: input.passportCountry ?? "ID",
        destinationCountry: input.destinationCountry ?? input.countryCode ?? "JP",
      }),
    ]);

    const checklistResult = await this.deps.checklist.generate({
      destination: input.city,
      passportCountry: input.passportCountry ?? "ID",
      visaDocuments: visa.documents,
    });

    const route =
      input.originLat != null &&
      input.originLng != null &&
      input.destLat != null &&
      input.destLng != null
        ? await this.deps.routes.getRoute({
            originLat: input.originLat,
            originLng: input.originLng,
            destinationLat: input.destLat,
            destinationLng: input.destLng,
            mode: "TRANSIT",
          })
        : null;

    return {
      hotels,
      restaurants,
      events,
      weather,
      visa,
      checklist: checklistResult,
      route,
    };
  }
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}
