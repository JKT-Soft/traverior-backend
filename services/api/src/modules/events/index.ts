import type { Env } from "../../config/env.js";
import type { CacheStore } from "../../shared/cache/index.js";
import { EventService } from "./application/service.js";
import { createEventRoutes } from "./http/routes.js";
import { createEventProvider } from "./infra/composite-provider.js";

export function createEventModule(env: Env, cache?: CacheStore) {
  const service = new EventService(createEventProvider(env), {
    cache,
    ttlSeconds: env.cache.ttl.events,
  });
  return { service, routes: createEventRoutes(service) };
}
