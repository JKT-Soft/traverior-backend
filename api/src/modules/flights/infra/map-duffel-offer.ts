import type {
  FlightAirline,
  FlightAirport,
  FlightBaggageAllowance,
  FlightOffer,
  FlightSearchQuery,
  FlightSegment,
  FlightSlice,
  FlightTransit,
} from "../domain/ports.js";

export type DuffelPlace = {
  iata_code?: string;
  name?: string;
  city_name?: string;
};

export type DuffelAirline = {
  iata_code?: string;
  name?: string;
};

export type DuffelBaggage = {
  type?: string;
  quantity?: number;
};

export type DuffelPassenger = {
  cabin_class?: string;
  cabin_class_marketing_name?: string;
  baggages?: DuffelBaggage[];
};

export type DuffelSegment = {
  operating_carrier?: DuffelAirline;
  operating_carrier_flight_number?: string;
  marketing_carrier_flight_number?: string;
  departing_at?: string;
  arriving_at?: string;
  duration?: string;
  origin?: DuffelPlace;
  destination?: DuffelPlace;
  origin_terminal?: string | null;
  destination_terminal?: string | null;
  passengers?: DuffelPassenger[];
  stops?: unknown[];
};

export type DuffelSlice = {
  duration?: string;
  origin?: DuffelPlace;
  destination?: DuffelPlace;
  segments?: DuffelSegment[];
};

export type DuffelOffer = {
  id: string;
  total_amount: string;
  total_currency: string;
  slices?: DuffelSlice[];
};

export function parseIsoDurationMinutes(duration?: string | null): number {
  if (!duration) return 0;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return 0;
  return Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
}

export function mapDuffelOffer(
  offer: DuffelOffer,
  query: FlightSearchQuery,
  provider: string,
): FlightOffer {
  const mapped = (offer.slices ?? []).map((slice, index) =>
    mapSlice(slice, query, index === 0 ? "outbound" : "inbound"),
  );
  const slices = mapped.length > 0 ? mapped : [emptySlice(query)];
  const outbound = slices[0] ?? emptySlice(query);
  const firstSegment = outbound.segments[0];

  return {
    contentType: "flight",
    provider,
    providerRef: offer.id,
    fetchedAt: new Date().toISOString(),
    deepLinkUrl: undefined,
    airline: firstSegment?.airline ?? unknownAirline(),
    carrier: firstSegment?.airline.name ?? unknownAirline().name,
    flightNumber: firstSegment?.flightNumber ?? "",
    origin: outbound.origin.code,
    destination: outbound.destination.code,
    originAirport: outbound.origin,
    destinationAirport: outbound.destination,
    departureAt: outbound.departureAt,
    arrivalAt: outbound.arrivalAt,
    cabin: firstSegment?.cabin ?? query.cabinClass ?? "economy",
    cabinLabel: firstSegment?.cabinLabel ?? formatCabinLabel(query.cabinClass ?? "economy"),
    durationMinutes: outbound.durationMinutes,
    transit: outbound.transit,
    stops: outbound.stops,
    baggage: firstSegment?.baggage ?? [],
    price: {
      amount: Number(offer.total_amount),
      currency: offer.total_currency,
      isEstimate: false,
    },
    slices,
  };
}

function mapSlice(
  slice: DuffelSlice,
  query: FlightSearchQuery,
  direction: "outbound" | "inbound",
): FlightSlice {
  const fallbackOrigin = direction === "outbound" ? query.origin : query.destination;
  const fallbackDestination = direction === "outbound" ? query.destination : query.origin;
  const fallbackDate = direction === "outbound" ? query.departureDate : (query.returnDate ?? query.departureDate);
  const segments = (slice.segments ?? []).map((segment) =>
    mapSegment(segment, query, fallbackOrigin, fallbackDestination, fallbackDate),
  );
  const first = segments[0];
  const last = segments[segments.length - 1];
  const origin = mergeAirport(
    slice.origin,
    first?.origin ?? airportFromCode(fallbackOrigin),
    first?.origin.terminal,
  );
  const destination = mergeAirport(
    slice.destination,
    last?.destination ?? airportFromCode(fallbackDestination),
    last?.destination.terminal,
  );
  const stops = sliceStops(slice.segments ?? []);
  const durationMinutes =
    parseIsoDurationMinutes(slice.duration) ||
    segments.reduce((sum, segment) => sum + segment.durationMinutes, 0);

  return {
    origin,
    destination,
    departureAt: first?.departureAt ?? `${fallbackDate}T00:00:00Z`,
    arrivalAt: last?.arrivalAt ?? `${fallbackDate}T00:00:00Z`,
    durationMinutes,
    stops,
    transit: transitFromStops(stops),
    segments,
  };
}

function mapSegment(
  segment: DuffelSegment,
  query: FlightSearchQuery,
  fallbackOrigin: string,
  fallbackDestination: string,
  fallbackDate: string,
): FlightSegment {
  const passenger = segment.passengers?.[0];
  const cabin = passenger?.cabin_class ?? query.cabinClass ?? "economy";
  return {
    airline: airlineFrom(segment.operating_carrier),
    flightNumber:
      segment.operating_carrier_flight_number ?? segment.marketing_carrier_flight_number ?? "",
    origin: airportFromPlace(segment.origin, fallbackOrigin, segment.origin_terminal),
    destination: airportFromPlace(segment.destination, fallbackDestination, segment.destination_terminal),
    departureAt: segment.departing_at ?? `${fallbackDate}T00:00:00Z`,
    arrivalAt: segment.arriving_at ?? `${fallbackDate}T00:00:00Z`,
    durationMinutes: parseIsoDurationMinutes(segment.duration),
    cabin,
    cabinLabel: passenger?.cabin_class_marketing_name ?? formatCabinLabel(cabin),
    baggage: mapBaggage(passenger?.baggages),
  };
}

export function mapBaggage(baggages?: DuffelBaggage[]): FlightBaggageAllowance[] {
  if (!baggages) return [];
  const next: FlightBaggageAllowance[] = [];
  for (const bag of baggages) {
    if (bag.type !== "checked" && bag.type !== "carry_on") continue;
    next.push({ type: bag.type, quantity: Number(bag.quantity ?? 0) });
  }
  return next;
}

export function sliceStops(segments: DuffelSegment[]): number {
  const connections = Math.max(0, segments.length - 1);
  const technical = segments.reduce(
    (sum, segment) => sum + (Array.isArray(segment.stops) ? segment.stops.length : 0),
    0,
  );
  return connections + technical;
}

export function transitFromStops(stops: number): FlightTransit {
  return stops === 0 ? "direct" : "transit";
}

export function formatCabinLabel(cabin: string): string {
  return cabin
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function airlineFrom(carrier?: DuffelAirline): FlightAirline {
  const iataCode = carrier?.iata_code?.trim() || null;
  const name = carrier?.name?.trim() || iataCode || unknownAirline().name;
  return { name, iataCode };
}

function unknownAirline(): FlightAirline {
  return { name: "Unknown", iataCode: null };
}

function airportFromCode(code: string): FlightAirport {
  return { code, name: null, cityName: null, terminal: null };
}

function airportFromPlace(
  place: DuffelPlace | undefined,
  fallbackCode: string,
  terminal?: string | null,
): FlightAirport {
  return {
    code: place?.iata_code ?? fallbackCode,
    name: place?.name ?? null,
    cityName: place?.city_name ?? null,
    terminal: emptyToNull(terminal),
  };
}

function mergeAirport(
  place: DuffelPlace | undefined,
  fallback: FlightAirport,
  terminal?: string | null,
): FlightAirport {
  return {
    code: place?.iata_code ?? fallback.code,
    name: place?.name ?? fallback.name,
    cityName: place?.city_name ?? fallback.cityName,
    terminal: emptyToNull(terminal) ?? fallback.terminal,
  };
}

function emptySlice(query: FlightSearchQuery): FlightSlice {
  const origin = airportFromCode(query.origin);
  const destination = airportFromCode(query.destination);
  return {
    origin,
    destination,
    departureAt: `${query.departureDate}T00:00:00Z`,
    arrivalAt: `${query.departureDate}T00:00:00Z`,
    durationMinutes: 0,
    stops: 0,
    transit: "direct",
    segments: [],
  };
}

function emptyToNull(value?: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
