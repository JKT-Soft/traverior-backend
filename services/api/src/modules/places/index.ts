import type { Env } from "../../config/env.js";
import { PlaceService } from "./application/service.js";
import type { PlaceProvider } from "./domain/ports.js";
import { createPlaceRoutes } from "./http/routes.js";
import { createGooglePlaceProvider } from "./infra/google-provider.js";
import { MockPlaceProvider } from "./infra/mock-provider.js";

export function createPlaceProvider(env: Env): PlaceProvider {
  switch (env.providers.places) {
    case "google":
      return createGooglePlaceProvider(env);
    case "mock":
      return new MockPlaceProvider();
    default:
      throw new Error(`Unknown PROVIDER_PLACES: ${env.providers.places}`);
  }
}

export function createPlaceModule(env: Env) {
  const service = new PlaceService(createPlaceProvider(env));
  return { service, routes: createPlaceRoutes(service) };
}
