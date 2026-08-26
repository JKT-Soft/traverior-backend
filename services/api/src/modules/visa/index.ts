import type { Env } from "../../config/env.js";
import type { CacheStore } from "../../shared/cache/index.js";
import { VisaService } from "./application/service.js";
import { createVisaRoutes } from "./http/routes.js";
import { createVisaProvider } from "./infra/sherpa-provider.js";

export function createVisaModule(env: Env, cache?: CacheStore) {
  const service = new VisaService(createVisaProvider(env), {
    cache,
    ttlSeconds: env.cache.ttl.visa,
  });
  return { service, routes: createVisaRoutes(service) };
}
