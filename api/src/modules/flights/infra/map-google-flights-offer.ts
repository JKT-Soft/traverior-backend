import type {
  FlightAirline,
  FlightAirport,
  FlightOffer,
  FlightSearchQuery,
  FlightSegment,
  FlightSlice,
} from "../domain/ports.js";
import { formatCabinLabel, transitFromStops } from "./map-duffel-offer.js";
import type { GoogleFlightsItinerary, GoogleFlightsSegment } from "./google-flights-rpc.js";

export type MapGoogleFlightsOptions = {
  currency: string;
  language?: string;
};

export function mapGoogleFlightsOffer(
  itinerary: GoogleFlightsItinerary,
  query: FlightSearchQuery,
  provider: string,
  options: MapGoogleFlightsOptions,
): FlightOffer {
  const cabin = query.cabinClass ?? "economy";
  const slice = mapSlice(itinerary.segments, query, cabin);
  const first = slice.segments[0];
  const airline = first?.airline ?? airlineFromNames(itinerary.airlineNames);

  const bookingToken = itinerary.bookingToken ?? undefined;
  const deepLinkUrl = bookingToken
    ? buildBookingDeepLink(bookingToken, options.currency, options.language)
    : buildDeepLink(query, options.currency, options.language);

  return {
    contentType: "flight",
    provider,
    providerRef: buildProviderRef(itinerary, query),
    fetchedAt: new Date().toISOString(),
    deepLinkUrl,
    bookingToken,
    airline,
    carrier: airline.name,
    flightNumber: first?.flightNumber ?? "",
    origin: slice.origin.code,
    destination: slice.destination.code,
    originAirport: slice.origin,
    destinationAirport: slice.destination,
    departureAt: slice.departureAt,
    arrivalAt: slice.arrivalAt,
    cabin,
    cabinLabel: formatCabinLabel(cabin),
    durationMinutes: slice.durationMinutes,
    transit: slice.transit,
    stops: slice.stops,
    baggage: [],
    price: {
      amount: Number(itinerary.price ?? 0),
      currency: options.currency.toUpperCase(),
      // Scraped display price — not a confirmed bookable offer via our stack
      isEstimate: true,
    },
    slices: [slice],
  };
}

function mapSlice(
  segments: GoogleFlightsSegment[],
  query: FlightSearchQuery,
  cabin: string,
): FlightSlice {
  const mapped = segments.map((segment) => mapSegment(segment, cabin));
  const first = mapped[0];
  const last = mapped[mapped.length - 1];
  const origin = first?.origin ?? airportFromCode(query.origin);
  const destination = last?.destination ?? airportFromCode(query.destination);
  const stops = Math.max(0, mapped.length - 1);
  const durationMinutes =
    mapped.reduce((sum, segment) => sum + segment.durationMinutes, 0) ||
    durationBetween(first?.departureAt, last?.arrivalAt);

  return {
    origin,
    destination,
    departureAt: first?.departureAt ?? `${query.departureDate}T00:00:00`,
    arrivalAt: last?.arrivalAt ?? `${query.departureDate}T00:00:00`,
    durationMinutes,
    stops,
    transit: transitFromStops(stops),
    segments: mapped,
  };
}

function mapSegment(segment: GoogleFlightsSegment, cabin: string): FlightSegment {
  const airline = airlineFrom(segment.airlineCode, segment.airlineName);
  return {
    airline,
    flightNumber: segment.flightNumber || airline.iataCode || "",
    origin: {
      code: segment.from.code,
      name: segment.from.name || null,
      cityName: null,
      terminal: null,
    },
    destination: {
      code: segment.to.code,
      name: segment.to.name || null,
      cityName: null,
      terminal: null,
    },
    departureAt: segment.departureAt,
    arrivalAt: segment.arrivalAt,
    durationMinutes: segment.durationMinutes,
    cabin,
    cabinLabel: formatCabinLabel(cabin),
    baggage: [],
  };
}

function airlineFrom(code: string | null, name: string | null): FlightAirline {
  const iataCode = code?.trim().toUpperCase() || null;
  return {
    name: name?.trim() || iataCode || "Unknown",
    iataCode,
  };
}

function airlineFromNames(names: string[]): FlightAirline {
  const name = names[0]?.trim();
  if (!name) return { name: "Unknown", iataCode: null };
  if (/^[A-Za-z0-9]{2}$/.test(name)) {
    return { name: name.toUpperCase(), iataCode: name.toUpperCase() };
  }
  return { name, iataCode: null };
}

function airportFromCode(code: string): FlightAirport {
  return {
    code: code.trim().toUpperCase(),
    name: null,
    cityName: null,
    terminal: null,
  };
}

export function buildDeepLink(
  query: FlightSearchQuery,
  currency: string,
  language = "en",
): string {
  const params = new URLSearchParams();
  const qParts = [
    `Flights from ${query.origin.toUpperCase()} to ${query.destination.toUpperCase()}`,
    `on ${query.departureDate}`,
  ];
  if (query.returnDate) {
    qParts.push(`through ${query.returnDate}`);
  }
  params.set("q", qParts.join(" "));
  params.set("hl", language);
  params.set("curr", currency.toUpperCase());
  return `https://www.google.com/travel/flights?${params.toString()}`;
}

/** Google Flights booking page for a selected itinerary (shows vendor fare cards in browser). */
export function buildBookingDeepLink(
  bookingToken: string,
  currency: string,
  language = "en",
): string {
  const params = new URLSearchParams({
    hl: language,
    curr: currency.toUpperCase(),
    tfu: bookingToken,
  });
  return `https://www.google.com/travel/flights/booking?${params.toString()}`;
}

function buildProviderRef(itinerary: GoogleFlightsItinerary, query: FlightSearchQuery): string {
  const first = itinerary.segments[0];
  const last = itinerary.segments[itinerary.segments.length - 1];
  const parts = [
    "google",
    first?.from.code ?? query.origin,
    last?.to.code ?? query.destination,
    first?.flightNumber ?? "",
    first?.departureAt ?? query.departureDate,
    String(itinerary.price ?? 0),
  ];
  return parts.join("-").replace(/\s+/g, "");
}

function durationBetween(start?: string, end?: string): number {
  if (!start || !end) return 0;
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 60_000);
}
