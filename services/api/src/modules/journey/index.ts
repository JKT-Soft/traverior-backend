import type { Env } from "../../config/env.js";
import type { CacheStore } from "../../shared/cache/index.js";
import { JourneyService } from "./application/service.js";
import { createJourneyRoutes } from "./http/routes.js";

export type CreateJourneyModuleOptions = {
  env?: Pick<Env, "cache">;
  cache?: CacheStore;
  db?: ConstructorParameters<typeof JourneyService>[0];
};

export function createJourneyModule(options: CreateJourneyModuleOptions = {}) {
  const service = new JourneyService(options.db, {
    cache: options.cache,
    ttlSeconds: options.env?.cache.ttl.trips ?? 60,
  });
  return { service, routes: createJourneyRoutes(service) };
}

export { JourneyService } from "./application/service.js";
