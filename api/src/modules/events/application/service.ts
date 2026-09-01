import type { CacheStore } from "../../../shared/cache/index.js";
import { cacheKey, getOrSet } from "../../../shared/cache/index.js";
import type { EventProvider, EventSearchQuery } from "../domain/ports.js";

export type EventServiceOptions = {
  cache?: CacheStore;
  ttlSeconds?: number;
};

export class EventService {
  private readonly cache?: CacheStore;
  private readonly ttlSeconds: number;

  constructor(
    private readonly provider: EventProvider,
    options: EventServiceOptions = {},
  ) {
    this.cache = options.cache;
    this.ttlSeconds = options.ttlSeconds ?? 1_800;
  }

  search(query: EventSearchQuery) {
    return getOrSet(
      {
        cache: this.cache,
        key: cacheKey("events:search", { provider: this.provider.name, query }),
        ttlSeconds: this.ttlSeconds,
      },
      () => this.provider.searchEvents(query),
    );
  }

  get providerName() {
    return this.provider.name;
  }
}
