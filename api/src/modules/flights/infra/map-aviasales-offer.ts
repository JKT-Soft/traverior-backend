import type {
  FlightAirline,
  FlightAirport,
  FlightOffer,
  FlightSearchQuery,
  FlightSegment,
  FlightSlice,
} from "../domain/ports.js";
import { formatCabinLabel, transitFromStops } from "./map-duffel-offer.js";

export type AviasalesPriceTicket = {
  origin?: string;
  destination?: string;
  origin_airport?: string;
  destination_airport?: string;
  price?: number;
  airline?: string;
  flight_number?: string;
  departure_at?: string;
  return_at?: string | null;
  transfers?: number;
  return_transfers?: number;
  duration?: number;
  duration_to?: number;
  duration_back?: number;
  link?: string;
  currency?: string;
};

export type MapAviasalesOptions = {
  currency?: string;
  marker?: string;
};

export function mapAviasalesOffer(
  ticket: AviasalesPriceTicket,
  query: FlightSearchQuery,
  provider: string,
  options: MapAviasalesOptions = {},
): FlightOffer {
  const cabin = query.cabinClass ?? "economy";
  const airline = airlineFrom(ticket.airline);
  const flightNumber = String(ticket.flight_number ?? "").trim();
  const outbound = mapOutboundSlice(ticket, query, airline, flightNumber, cabin);
  const inbound = query.returnDate ? mapInboundSlice(ticket, query, airline, flightNumber, cabin) : undefined;
  const slices = inbound ? [outbound, inbound] : [outbound];

  const currency = (
    ticket.currency ??
    options.currency ??
    "USD"
  ).toUpperCase();

  return {
    contentType: "flight",
    provider,
    providerRef: buildProviderRef(ticket, query),
    fetchedAt: new Date().toISOString(),
    deepLinkUrl: buildDeepLink(ticket.link, options.marker),
    airline,
    carrier: airline.name,
    flightNumber,
    origin: outbound.origin.code,
    destination: outbound.destination.code,
    originAirport: outbound.origin,
    destinationAirport: outbound.destination,
    departureAt: outbound.departureAt,
    arrivalAt: outbound.arrivalAt,
    cabin,
    cabinLabel: formatCabinLabel(cabin),
    durationMinutes: outbound.durationMinutes,
    transit: outbound.transit,
    stops: outbound.stops,
    baggage: [],
    price: {
      amount: Number(ticket.price ?? 0),
      currency,
      isEstimate: true,
    },
    slices,
  };
}

function mapOutboundSlice(
  ticket: AviasalesPriceTicket,
  query: FlightSearchQuery,
  airline: FlightAirline,
  flightNumber: string,
  cabin: string,
): FlightSlice {
  const origin = airportFromCode(ticket.origin_airport ?? ticket.origin ?? query.origin);
  const destination = airportFromCode(
    ticket.destination_airport ?? ticket.destination ?? query.destination,
  );
  const departureAt = ticket.departure_at ?? `${query.departureDate}T00:00:00Z`;
  const durationMinutes = Number(ticket.duration_to ?? ticket.duration ?? 0);
  const arrivalAt = addMinutes(departureAt, durationMinutes);
  const stops = Math.max(0, Number(ticket.transfers ?? 0));
  const segment = segmentFrom({
    airline,
    flightNumber,
    origin,
    destination,
    departureAt,
    arrivalAt,
    durationMinutes,
    cabin,
  });

  return {
    origin,
    destination,
    departureAt,
    arrivalAt,
    durationMinutes,
    stops,
    transit: transitFromStops(stops),
    segments: [segment],
  };
}

function mapInboundSlice(
  ticket: AviasalesPriceTicket,
  query: FlightSearchQuery,
  airline: FlightAirline,
  flightNumber: string,
  cabin: string,
): FlightSlice {
  const origin = airportFromCode(
    ticket.destination_airport ?? ticket.destination ?? query.destination,
  );
  const destination = airportFromCode(ticket.origin_airport ?? ticket.origin ?? query.origin);
  const departureAt =
    ticket.return_at ?? `${query.returnDate ?? query.departureDate}T00:00:00Z`;
  const durationMinutes = Number(ticket.duration_back ?? 0);
  const arrivalAt = addMinutes(departureAt, durationMinutes);
  const stops = Math.max(0, Number(ticket.return_transfers ?? 0));
  const segment = segmentFrom({
    airline,
    flightNumber,
    origin,
    destination,
    departureAt,
    arrivalAt,
    durationMinutes,
    cabin,
  });

  return {
    origin,
    destination,
    departureAt,
    arrivalAt,
    durationMinutes,
    stops,
    transit: transitFromStops(stops),
    segments: [segment],
  };
}

function segmentFrom(input: {
  airline: FlightAirline;
  flightNumber: string;
  origin: FlightAirport;
  destination: FlightAirport;
  departureAt: string;
  arrivalAt: string;
  durationMinutes: number;
  cabin: string;
}): FlightSegment {
  return {
    airline: input.airline,
    flightNumber: input.flightNumber,
    origin: input.origin,
    destination: input.destination,
    departureAt: input.departureAt,
    arrivalAt: input.arrivalAt,
    durationMinutes: input.durationMinutes,
    cabin: input.cabin,
    cabinLabel: formatCabinLabel(input.cabin),
    baggage: [],
  };
}

function airlineFrom(code?: string): FlightAirline {
  const iataCode = code?.trim().toUpperCase() || null;
  return {
    name: iataCode ?? "Unknown",
    iataCode,
  };
}

function airportFromCode(code: string): FlightAirport {
  return {
    code: code.trim().toUpperCase(),
    name: null,
    cityName: null,
    terminal: null,
  };
}

export function addMinutes(iso: string, minutes: number): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  date.setMinutes(date.getMinutes() + Math.max(0, minutes));
  return date.toISOString();
}

export function buildDeepLink(link?: string, marker?: string): string | undefined {
  if (!link?.trim()) return undefined;
  const path = link.startsWith("http") ? link : `https://www.aviasales.com${link.startsWith("/") ? "" : "/"}${link}`;
  if (!marker) return path;
  const joiner = path.includes("?") ? "&" : "?";
  return `${path}${joiner}marker=${encodeURIComponent(marker)}`;
}

function buildProviderRef(ticket: AviasalesPriceTicket, query: FlightSearchQuery): string {
  const parts = [
    "aviasales",
    ticket.origin ?? query.origin,
    ticket.destination ?? query.destination,
    ticket.airline ?? "",
    ticket.flight_number ?? "",
    ticket.departure_at ?? query.departureDate,
    String(ticket.price ?? 0),
  ];
  return parts.join("-").replace(/\s+/g, "");
}
