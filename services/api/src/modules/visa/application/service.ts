import type { CacheStore } from "../../../shared/cache/index.js";
import { cacheKey, getOrSet } from "../../../shared/cache/index.js";
import type { VisaProvider, VisaQuery } from "../domain/ports.js";

export type VisaServiceOptions = {
  cache?: CacheStore;
  ttlSeconds?: number;
};

export class VisaService {
  private readonly cache?: CacheStore;
  private readonly ttlSeconds: number;

  constructor(
    private readonly provider: VisaProvider,
    options: VisaServiceOptions = {},
  ) {
    this.cache = options.cache;
    this.ttlSeconds = options.ttlSeconds ?? 604_800;
  }

  getRequirements(query: VisaQuery) {
    return getOrSet(
      {
        cache: this.cache,
        key: cacheKey("visa:requirements", { provider: this.provider.name, query }),
        ttlSeconds: this.ttlSeconds,
      },
      () => this.provider.getRequirements(query),
    );
  }

  get providerName() {
    return this.provider.name;
  }
}
