import type { FlightOffer, FlightProvider, FlightSearchQuery } from "../domain/ports.js";

export class FlightService {
  constructor(private readonly provider: FlightProvider) {}

  search(query: FlightSearchQuery): Promise<FlightOffer[]> {
    return this.provider.searchFlights(query);
  }

  getOffer(offerId: string): Promise<FlightOffer | null> {
    if (!this.provider.getOffer) return Promise.resolve(null);
    return this.provider.getOffer(offerId);
  }

  get providerName(): string {
    return this.provider.name;
  }
}
