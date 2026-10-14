import type { ChecklistResult } from "../../modules/checklist/domain/ports.js";
import type { CheckpointNeed } from "../../modules/planner/domain/skeleton.js";

export type McpServerId =
  | "flights"
  | "hotels"
  | "places"
  | "routes"
  | "weather"
  | "events"
  | "visa"
  | "checklist";

export type McpToolResult = {
  ok: boolean;
  tool: string;
  data?: unknown;
  error?: string;
  fetchedAt?: string;
};

export type McpToolDescriptor = {
  name: string;
  description?: string;
  server: McpServerId;
};

/** Domain services used by the in-process MCP adapter (same contract as MCP tools). */
export type McpDomainServices = {
  flights: {
    search: (q: {
      origin: string;
      destination: string;
      departureDate: string;
      returnDate?: string;
      adults?: number;
    }) => Promise<unknown>;
    getOffer?: (id: string) => Promise<unknown | null>;
    providerName: string;
  };
  hotels: {
    search: (q: {
      cityName: string;
      countryCode?: string;
      checkIn: string;
      checkOut: string;
      adults?: number;
    }) => Promise<unknown>;
    providerName: string;
  };
  places: {
    searchRestaurants: (city: string, dietary?: string[]) => Promise<unknown>;
    searchPois: (city: string) => Promise<unknown>;
    search: (q: { textQuery: string; maxResultCount?: number }) => Promise<unknown>;
    providerName: string;
  };
  routes: {
    getRoute: (q: {
      originLat: number;
      originLng: number;
      destinationLat: number;
      destinationLng: number;
      mode?: "DRIVE" | "WALK" | "BICYCLE" | "TRANSIT";
    }) => Promise<unknown>;
    providerName: string;
  };
  weather: {
    getForecast: (q: { lat: number; lon: number }) => Promise<unknown>;
    providerName: string;
  };
  events: {
    search: (q: {
      city: string;
      startDate?: string;
      endDate?: string;
      includeFree?: boolean;
      includePaid?: boolean;
    }) => Promise<unknown>;
    providerName: string;
  };
  visa: {
    getRequirements: (q: {
      passportCountry: string;
      destinationCountry: string;
      travelDate?: string;
    }) => Promise<unknown>;
    providerName: string;
  };
  checklist: {
    generate: (q: {
      destination: string;
      countryCode?: string;
      passportCountry?: string;
      visaDocuments?: string[];
    }) => Promise<ChecklistResult>;
    providerName: string;
  };
};

export interface McpToolClient {
  readonly name: string;
  callTool(tool: string, args: Record<string, unknown>): Promise<McpToolResult>;
  listTools(): Promise<McpToolDescriptor[]>;
  close?(): Promise<void>;
}

export type PlannerToolContext = {
  originIata?: string;
  destinationIata?: string;
  departureDate?: string;
  returnDate?: string;
  checkIn?: string;
  checkOut?: string;
  adults?: number;
  passportCountry?: string;
  originLat?: number;
  originLng?: number;
  destLat?: number;
  destLng?: number;
};

export const NEED_TO_TOOLS: Record<CheckpointNeed, string[]> = {
  flights: ["search_flights"],
  hotels: ["search_hotels"],
  places: ["search_restaurants", "search_pois"],
  routes: ["get_route"],
  weather: ["get_forecast"],
  events: ["search_events"],
  visa: ["get_visa_requirements"],
  checklist: ["generate_checklist"],
};
