import type { CacheStore } from "../../../shared/cache/index.js";
import { cacheKey, getOrSet } from "../../../shared/cache/index.js";
import type { RouteProvider, RouteQuery } from "../domain/ports.js";

export type RouteServiceOptions = {
  cache?: CacheStore;
  ttlSeconds?: number;
};

export class RouteService {
  private readonly cache?: CacheStore;
  private readonly ttlSeconds: number;

  constructor(
    private readonly provider: RouteProvider,
    options: RouteServiceOptions = {},
  ) {
    this.cache = options.cache;
    this.ttlSeconds = options.ttlSeconds ?? 3_600;
  }

  getRoute(query: RouteQuery) {
    return getOrSet(
      {
        cache: this.cache,
        key: cacheKey("routes:get", { provider: this.provider.name, query }),
        ttlSeconds: this.ttlSeconds,
      },
      () => this.provider.getRoute(query),
    );
  }

  get providerName() {
    return this.provider.name;
  }
}
