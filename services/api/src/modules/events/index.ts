import type { Env } from "../../config/env.js";
import { EventService } from "./application/service.js";
import { createEventRoutes } from "./http/routes.js";
import { createEventProvider } from "./infra/composite-provider.js";

export function createEventModule(env: Env) {
  const service = new EventService(createEventProvider(env));
  return { service, routes: createEventRoutes(service) };
}
