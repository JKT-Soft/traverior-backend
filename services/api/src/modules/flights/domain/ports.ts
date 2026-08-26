import type { Money, ProviderMeta } from "../../../shared/types/provider.js";

export type FlightSearchQuery = {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  adults?: number;
  cabinClass?: "economy" | "premium_economy" | "business" | "first";
};

export type FlightOffer = ProviderMeta & {
  contentType: "flight";
  carrier: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureAt: string;
  arrivalAt: string;
  cabin: string;
  durationMinutes: number;
  price: Money;
};

/** Port — swap Duffel / Amadeus / mock without touching application code */
export interface FlightProvider {
  readonly name: string;
  searchFlights(query: FlightSearchQuery): Promise<FlightOffer[]>;
  getOffer?(offerId: string): Promise<FlightOffer | null>;
}
