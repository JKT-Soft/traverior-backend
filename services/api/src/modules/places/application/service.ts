import type { CacheStore } from "../../../shared/cache/index.js";
import { cacheKey, getOrSet } from "../../../shared/cache/index.js";
import type { PlaceProvider, PlaceSearchQuery } from "../domain/ports.js";

export type PlaceServiceOptions = {
  cache?: CacheStore;
  ttlSeconds?: number;
};

export class PlaceService {
  private readonly cache?: CacheStore;
  private readonly ttlSeconds: number;

  constructor(
    private readonly provider: PlaceProvider,
    options: PlaceServiceOptions = {},
  ) {
    this.cache = options.cache;
    this.ttlSeconds = options.ttlSeconds ?? 86_400;
  }

  search(query: PlaceSearchQuery) {
    return getOrSet(
      {
        cache: this.cache,
        key: cacheKey("places:search", { provider: this.provider.name, query }),
        ttlSeconds: this.ttlSeconds,
      },
      () => this.provider.searchPlaces(query),
    );
  }

  searchRestaurants(city: string, dietary?: string[]) {
    const diet = dietary?.length ? `${dietary.join(" ")} ` : "";
    return this.search({ textQuery: `${diet}restaurants in ${city}` });
  }

  searchPois(city: string) {
    return this.search({ textQuery: `tourist attractions in ${city}` });
  }

  get providerName() {
    return this.provider.name;
  }
}
