import type { CacheStore } from "../../../shared/cache/index.js";
import { cacheKey, getOrSet } from "../../../shared/cache/index.js";
import type { HotelProvider, HotelSearchQuery } from "../domain/ports.js";

export type HotelServiceOptions = {
  cache?: CacheStore;
  ttlSeconds?: number;
};

export class HotelService {
  private readonly cache?: CacheStore;
  private readonly ttlSeconds: number;

  constructor(
    private readonly provider: HotelProvider,
    options: HotelServiceOptions = {},
  ) {
    this.cache = options.cache;
    this.ttlSeconds = options.ttlSeconds ?? 900;
  }

  search(query: HotelSearchQuery) {
    return getOrSet(
      {
        cache: this.cache,
        key: cacheKey("hotels:search", { provider: this.provider.name, query }),
        ttlSeconds: this.ttlSeconds,
      },
      () => this.provider.searchHotels(query),
    );
  }

  get providerName() {
    return this.provider.name;
  }
}
