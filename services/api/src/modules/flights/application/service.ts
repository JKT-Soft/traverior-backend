import type { CacheStore } from "../../../shared/cache/index.js";
import { cacheKey, getOrSet } from "../../../shared/cache/index.js";
import type { FlightOffer, FlightProvider, FlightSearchQuery } from "../domain/ports.js";

export type FlightServiceOptions = {
  cache?: CacheStore;
  ttlSeconds?: number;
};

export class FlightService {
  private readonly cache?: CacheStore;
  private readonly ttlSeconds: number;

  constructor(
    private readonly provider: FlightProvider,
    options: FlightServiceOptions = {},
  ) {
    this.cache = options.cache;
    this.ttlSeconds = options.ttlSeconds ?? 900;
  }

  search(query: FlightSearchQuery): Promise<FlightOffer[]> {
    return getOrSet(
      {
        cache: this.cache,
        key: cacheKey("flights:search", { provider: this.provider.name, query }),
        ttlSeconds: this.ttlSeconds,
      },
      () => this.provider.searchFlights(query),
    );
  }

  getOffer(offerId: string): Promise<FlightOffer | null> {
    if (!this.provider.getOffer) return Promise.resolve(null);
    return getOrSet(
      {
        cache: this.cache,
        key: cacheKey("flights:offer", { provider: this.provider.name, offerId }),
        ttlSeconds: this.ttlSeconds,
      },
      () => this.provider.getOffer!(offerId),
    );
  }

  get providerName(): string {
    return this.provider.name;
  }
}
