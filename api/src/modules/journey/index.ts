import type { Env } from "../../config/env.js";
import type { CacheStore } from "../../shared/cache/index.js";
import type { CostService } from "../cost/service.js";
import type { ImageService } from "../images/index.js";
import type { PlannerService } from "../planner/service.js";
import type { PolicyService } from "../policy/service.js";
import type { ApplicationLogService } from "../../shared/logging/application-log.js";
import { JourneyService } from "./application/service.js";
import { createJourneyRoutes } from "./http/routes.js";

export type CreateJourneyModuleOptions = {
  env?: Pick<Env, "cache">;
  cache?: CacheStore;
  db?: ConstructorParameters<typeof JourneyService>[0];
  planner?: PlannerService;
  cost?: CostService;
  policy?: PolicyService;
  images?: ImageService;
  logs?: ApplicationLogService;
};

export function createJourneyModule(options: CreateJourneyModuleOptions = {}) {
  const service = new JourneyService(options.db, {
    cache: options.cache,
    ttlSeconds: options.env?.cache.ttl.trips ?? 60,
    planner: options.planner,
    cost: options.cost,
    policy: options.policy,
    images: options.images,
    logs: options.logs,
  });
  return { service, routes: createJourneyRoutes(service) };
}

export { JourneyService } from "./application/service.js";
