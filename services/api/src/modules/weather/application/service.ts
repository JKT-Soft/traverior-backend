import type { CacheStore } from "../../../shared/cache/index.js";
import { cacheKey, getOrSet } from "../../../shared/cache/index.js";
import type { WeatherProvider, WeatherQuery } from "../domain/ports.js";

export type WeatherServiceOptions = {
  cache?: CacheStore;
  ttlSeconds?: number;
};

export class WeatherService {
  private readonly cache?: CacheStore;
  private readonly ttlSeconds: number;

  constructor(
    private readonly provider: WeatherProvider,
    options: WeatherServiceOptions = {},
  ) {
    this.cache = options.cache;
    this.ttlSeconds = options.ttlSeconds ?? 1_800;
  }

  getForecast(query: WeatherQuery) {
    return getOrSet(
      {
        cache: this.cache,
        key: cacheKey("weather:forecast", { provider: this.provider.name, query }),
        ttlSeconds: this.ttlSeconds,
      },
      () => this.provider.getForecast(query),
    );
  }

  get providerName() {
    return this.provider.name;
  }
}
