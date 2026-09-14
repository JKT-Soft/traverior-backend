import type {
  FlightAirport,
  FlightOffer,
  FlightProvider,
  FlightSearchQuery,
  FlightSlice,
} from "../domain/ports.js";
import { formatCabinLabel } from "./map-duffel-offer.js";

export class MockFlightProvider implements FlightProvider {
  readonly name = "mock";

  async searchFlights(query: FlightSearchQuery): Promise<FlightOffer[]> {
    const adults = query.adults ?? 1;
    const cabin = query.cabinClass ?? "economy";
    const outbound = mockSlice({
      origin: mockAirport(query.origin, "Soekarno-Hatta", "Jakarta", "3"),
      destination: mockAirport(query.destination, "Kansai", "Osaka", "1"),
      departureAt: `${query.departureDate}T08:15:00+07:00`,
      arrivalAt: `${query.departureDate}T16:40:00+09:00`,
      durationMinutes: 445,
      flightNumber: "882",
      cabin,
    });
    const inbound = query.returnDate
      ? mockSlice({
          origin: mockAirport(query.destination, "Kansai", "Osaka", "1"),
          destination: mockAirport(query.origin, "Soekarno-Hatta", "Jakarta", "3"),
          departureAt: `${query.returnDate}T10:00:00+09:00`,
          arrivalAt: `${query.returnDate}T15:20:00+07:00`,
          durationMinutes: 440,
          flightNumber: "883",
          cabin,
        })
      : undefined;

    return [
      {
        contentType: "flight",
        provider: this.name,
        providerRef: `mock-${query.origin}-${query.destination}`,
        fetchedAt: new Date().toISOString(),
        deepLinkUrl: `https://example.com/flights/${query.origin}-${query.destination}`,
        airline: { name: "Garuda Indonesia", iataCode: "GA" },
        carrier: "Garuda Indonesia",
        flightNumber: outbound.segments[0]?.flightNumber ?? "882",
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
        baggage: outbound.segments[0]?.baggage ?? [],
        price: {
          amount: 4_100_000 * adults,
          currency: "IDR",
          isEstimate: true,
        },
        slices: inbound ? [outbound, inbound] : [outbound],
      },
    ];
  }

  async getOffer(offerId: string): Promise<FlightOffer | null> {
    if (!offerId.startsWith("mock-")) return null;
    const [, origin, destination] = offerId.split("-");
    const [offer] = await this.searchFlights({
      origin: origin || "CGK",
      destination: destination || "KIX",
      departureDate: new Date().toISOString().slice(0, 10),
    });
    return offer ?? null;
  }
}

function mockAirport(code: string, name: string, cityName: string, terminal: string): FlightAirport {
  return { code, name, cityName, terminal };
}

function mockSlice(input: {
  origin: FlightAirport;
  destination: FlightAirport;
  departureAt: string;
  arrivalAt: string;
  durationMinutes: number;
  flightNumber: string;
  cabin: string;
}): FlightSlice {
  return {
    origin: input.origin,
    destination: input.destination,
    departureAt: input.departureAt,
    arrivalAt: input.arrivalAt,
    durationMinutes: input.durationMinutes,
    stops: 0,
    transit: "direct",
    segments: [
      {
        airline: { name: "Garuda Indonesia", iataCode: "GA" },
        flightNumber: input.flightNumber,
        origin: input.origin,
        destination: input.destination,
        departureAt: input.departureAt,
        arrivalAt: input.arrivalAt,
        durationMinutes: input.durationMinutes,
        cabin: input.cabin,
        cabinLabel: formatCabinLabel(input.cabin),
        baggage: [{ type: "checked", quantity: 1 }],
      },
    ],
  };
}
