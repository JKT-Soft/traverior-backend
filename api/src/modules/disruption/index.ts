import { DisruptionMonitorService, type DisruptionDb } from "./application/service.js";
import { createDisruptionRoutes } from "./http/routes.js";
import {
  startDisruptionMonitorWorker,
  type DisruptionWorkerOptions,
} from "./worker/scheduler.js";
import type { WeatherService } from "../weather/application/service.js";

export type DisruptionModuleDependencies = {
  db?: DisruptionDb;
  weather?: WeatherService;
  workerOptions?: DisruptionWorkerOptions;
  startWorker?: boolean;
};

export function createDisruptionModule(deps: DisruptionModuleDependencies = {}) {
  const service = new DisruptionMonitorService({
    db: deps.db,
    weather: deps.weather,
  });

  const routes = createDisruptionRoutes(service);

  const worker = deps.startWorker
    ? startDisruptionMonitorWorker(service, deps.workerOptions)
    : undefined;

  return { service, routes, worker };
}

export { DisruptionMonitorService, serializeTripAlert } from "./application/service.js";
export { startDisruptionMonitorWorker } from "./worker/scheduler.js";
export { createDisruptionRoutes } from "./http/routes.js";
export type {
  CheckTripResult,
  DisruptionCandidate,
  DisruptionKind,
  ListAlertsFilter,
  SerializedTripAlert,
} from "./domain/types.js";
export type {
  DisruptionWorkerHandle,
  DisruptionWorkerOptions,
} from "./worker/scheduler.js";
