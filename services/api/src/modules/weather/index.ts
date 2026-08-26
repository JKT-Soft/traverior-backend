import type { Env } from "../../config/env.js";
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

export function createWeatherModule(env: Env) {
  const service = new WeatherService(createWeatherProvider(env));
  return { service, routes: createWeatherRoutes(service) };
}
