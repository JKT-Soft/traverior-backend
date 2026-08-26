import type { FlightService } from "../flights/application/service.js";
import type { HotelService } from "../hotels/application/service.js";
import type { PlaceService } from "../places/application/service.js";
import type { RouteService } from "../routes/application/service.js";
import type { WeatherService } from "../weather/application/service.js";
import type { EventService } from "../events/application/service.js";
import type { VisaService } from "../visa/application/service.js";
import type { ChecklistService } from "../checklist/application/service.js";

export type PlannerDeps = {
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
 * AI Planner orchestrates domain modules (MCP tools will call the same services).
 * Phase 1 MVP: deterministic enrichment stubs — LLM wiring comes next.
 */
export class PlannerService {
  constructor(private readonly deps: PlannerDeps) {}

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
    const [hotels, restaurants, events, weather, visa, checklist] = await Promise.all([
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
      Promise.resolve(null as null),
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
