import type { Env } from "../../config/env.js";
import type { CacheStore } from "../../shared/cache/index.js";
import { WeatherService } from "./application/service.js";
import type { WeatherProvider } from "./domain/ports.js";
import { createWeatherRoutes } from "./http/routes.js";
import { MockWeatherProvider } from "./infra/mock-provider.js";
import { createOpenWeatherProvider } from "./infra/openweather-provider.js";

export function createWeatherProvider(env: Env): WeatherProvider {
  switch (env.providers.weather) {
    case "openweather":
      return createOpenWeatherProvider(env);
    case "mock":
      return new MockWeatherProvider();
    default:
      throw new Error(`Unknown PROVIDER_WEATHER: ${env.providers.weather}`);
  }
}

export function createWeatherModule(env: Env, cache?: CacheStore) {
  const service = new WeatherService(createWeatherProvider(env), {
    cache,
    ttlSeconds: env.cache.ttl.weather,
  });
  return { service, routes: createWeatherRoutes(service) };
}
