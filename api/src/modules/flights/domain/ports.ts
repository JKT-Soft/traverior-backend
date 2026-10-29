import type { Money, ProviderMeta } from "../../../shared/types/provider.js";

export type FlightSearchQuery = {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  adults?: number;
  cabinClass?: "economy" | "premium_economy" | "business" | "first";
};

export type FlightTransit = "direct" | "transit";

export type FlightAirline = {
  name: string;
  iataCode: string | null;
};

export type FlightAirport = {
  code: string;
  name: string | null;
  cityName: string | null;
  terminal: string | null;
};

export type FlightBaggageAllowance = {
  type: "checked" | "carry_on";
  quantity: number;
};

export type FlightSegment = {
  airline: FlightAirline;
  flightNumber: string;
  origin: FlightAirport;
  destination: FlightAirport;
  departureAt: string;
  arrivalAt: string;
  durationMinutes: number;
  cabin: string;
  cabinLabel: string | null;
  baggage: FlightBaggageAllowance[];
};

export type FlightSlice = {
  origin: FlightAirport;
  destination: FlightAirport;
  departureAt: string;
  arrivalAt: string;
  durationMinutes: number;
  stops: number;
  transit: FlightTransit;
  segments: FlightSegment[];
};

export type FlightOffer = ProviderMeta & {
  contentType: "flight";
  airline: FlightAirline;
  /** Display alias of `airline.name` (kept for pipeline/mobile consumers). */
  carrier: string;
  flightNumber: string;
  origin: string;
  destination: string;
  originAirport: FlightAirport;
  destinationAirport: FlightAirport;
  departureAt: string;
  arrivalAt: string;
  cabin: string;
  cabinLabel: string | null;
  durationMinutes: number;
  transit: FlightTransit;
  stops: number;
  baggage: FlightBaggageAllowance[];
  price: Money;
  slices: FlightSlice[];
  /**
   * Provider-specific opaque token used to open booking options
   * (Google Flights `tfu` / price-block token).
   */
  bookingToken?: string;
};

export type FlightBookingOption = {
  id: string;
  agency: string;
  agencyCode: string | null;
  price: Money;
  bookingUrl: string;
  isAirlineDirect: boolean;
  fareName: string | null;
  logoUrl: string | null;
};

export type FlightOfferDetailQuery = {
  providerRef?: string;
  bookingToken?: string;
  origin?: string;
  destination?: string;
  departureDate?: string;
  returnDate?: string;
  adults?: number;
  cabinClass?: FlightSearchQuery["cabinClass"];
  flightNumber?: string;
  currency?: string;
};

export type FlightOfferDetail = {
  offer: FlightOffer;
  bookingOptions: FlightBookingOption[];
};

/** Port — swap Duffel / Aviasales / Google Flights / mock without touching application code */
export interface FlightProvider {
  readonly name: string;
  searchFlights(query: FlightSearchQuery): Promise<FlightOffer[]>;
  getOffer?(offerId: string): Promise<FlightOffer | null>;
  getOfferDetail?(query: FlightOfferDetailQuery): Promise<FlightOfferDetail | null>;
}
