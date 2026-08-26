import type { Env } from "../../config/env.js";
import { RouteService } from "./application/service.js";
import type { RouteProvider } from "./domain/ports.js";
import { createRouteRoutes } from "./http/routes.js";
import { createGoogleRouteProvider } from "./infra/google-provider.js";
import { MockRouteProvider } from "./infra/mock-provider.js";

export function createRouteProvider(env: Env): RouteProvider {
  switch (env.providers.routes) {
    case "google":
      return createGoogleRouteProvider(env);
    case "mock":
      return new MockRouteProvider();
    default:
      throw new Error(`Unknown PROVIDER_ROUTES: ${env.providers.routes}`);
  }
}

export function createRouteModule(env: Env) {
  const service = new RouteService(createRouteProvider(env));
  return { service, routes: createRouteRoutes(service) };
}
