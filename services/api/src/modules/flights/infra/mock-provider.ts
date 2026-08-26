import type { FlightOffer, FlightProvider, FlightSearchQuery } from "../domain/ports.js";

export class MockFlightProvider implements FlightProvider {
  readonly name = "mock";

  async searchFlights(query: FlightSearchQuery): Promise<FlightOffer[]> {
    const adults = query.adults ?? 1;
    return [
      {
        contentType: "flight",
        provider: this.name,
        providerRef: `mock-${query.origin}-${query.destination}`,
        fetchedAt: new Date().toISOString(),
        deepLinkUrl: `https://example.com/flights/${query.origin}-${query.destination}`,
        carrier: "Mock Air",
        flightNumber: "MK100",
        origin: query.origin,
        destination: query.destination,
        departureAt: `${query.departureDate}T08:00:00Z`,
        arrivalAt: `${query.departureDate}T18:30:00Z`,
        cabin: query.cabinClass ?? "economy",
        durationMinutes: 630,
        price: {
          amount: 4500000 * adults,
          currency: "IDR",
          isEstimate: true,
        },
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
