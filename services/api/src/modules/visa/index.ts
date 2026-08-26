import type { Env } from "../../config/env.js";
import { VisaService } from "./application/service.js";
import { createVisaRoutes } from "./http/routes.js";
import { createVisaProvider } from "./infra/sherpa-provider.js";

export function createVisaModule(env: Env) {
  const service = new VisaService(createVisaProvider(env));
  return { service, routes: createVisaRoutes(service) };
}
