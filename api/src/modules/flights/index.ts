import type { Env } from "../../config/env.js";
import type { CacheStore } from "../../shared/cache/index.js";
import { FlightService } from "./application/service.js";
import type { FlightProvider } from "./domain/ports.js";
import { createFlightRoutes } from "./http/routes.js";
import { createDuffelFlightProvider } from "./infra/duffel-provider.js";
import { MockFlightProvider } from "./infra/mock-provider.js";

export function createFlightProvider(env: Env): FlightProvider {
  switch (env.providers.flights) {
    case "duffel":
      return createDuffelFlightProvider(env);
    case "mock":
      return new MockFlightProvider();
    default:
      throw new Error(`Unknown PROVIDER_FLIGHTS: ${env.providers.flights}`);
  }
}

export function createFlightModule(env: Env, cache?: CacheStore) {
  const provider = createFlightProvider(env);
  const service = new FlightService(provider, {
    cache,
    ttlSeconds: env.cache.ttl.flights,
  });
  return {
    service,
    routes: createFlightRoutes(service),
  };
}

export { FlightService } from "./application/service.js";
export type { FlightProvider, FlightOffer, FlightSearchQuery } from "./domain/ports.js";
