import type { FastifyInstance } from "fastify";
import type { Env } from "./config/env.js";
import { createAuthModule } from "./modules/auth/index.js";
import { createChecklistModule } from "./modules/checklist/index.js";
import { CostService } from "./modules/cost/service.js";
import { createEventModule } from "./modules/events/index.js";
import { createFlightModule } from "./modules/flights/index.js";
import { createHotelModule } from "./modules/hotels/index.js";
import { createJourneyModule } from "./modules/journey/index.js";
import { createPlaceModule } from "./modules/places/index.js";
import { createPlannerRoutes } from "./modules/planner/http.js";
import { PlannerService } from "./modules/planner/service.js";
import { PolicyService } from "./modules/policy/service.js";
import { createRouteModule } from "./modules/routes/index.js";
import { createVisaModule } from "./modules/visa/index.js";
import { createWeatherModule } from "./modules/weather/index.js";
import { buildApp, type AuthResolver } from "./shared/http/app.js";
import { ok } from "./shared/http/reply.js";
import { createFileLogger } from "./shared/logging/logger.js";

export type AppContainer = {
  env: Env;
  app: FastifyInstance;
  resolveAuth: AuthResolver;
  services: {
    auth: ReturnType<typeof createAuthModule>["service"];
    flights: ReturnType<typeof createFlightModule>["service"];
    hotels: ReturnType<typeof createHotelModule>["service"];
    places: ReturnType<typeof createPlaceModule>["service"];
    routes: ReturnType<typeof createRouteModule>["service"];
    weather: ReturnType<typeof createWeatherModule>["service"];
    events: ReturnType<typeof createEventModule>["service"];
    visa: ReturnType<typeof createVisaModule>["service"];
    checklist: ReturnType<typeof createChecklistModule>["service"];
    journey: ReturnType<typeof createJourneyModule>["service"];
    cost: CostService;
    policy: PolicyService;
    planner: PlannerService;
  };
};

export async function createContainer(env: Env): Promise<AppContainer> {
  const auth = createAuthModule(env);
  const flights = createFlightModule(env);
  const hotels = createHotelModule(env);
  const places = createPlaceModule(env);
  const routes = createRouteModule(env);
  const weather = createWeatherModule(env);
  const events = createEventModule(env);
  const visa = createVisaModule(env);
  const checklist = createChecklistModule();
  const journey = createJourneyModule();
  const cost = new CostService();
  const policy = new PolicyService();
  
  const planner = new PlannerService({
    flights: flights.service,
    hotels: hotels.service,
    places: places.service,
    routes: routes.service,
    weather: weather.service,
    events: events.service,
    visa: visa.service,
    checklist: checklist.service,
  });

  const isDev = env.nodeEnv !== "production" && env.nodeEnv !== "test";
  const enableFileLogs = env.nodeEnv !== "test";
  const app = buildApp({
    auth: auth.resolveAuth,
    logger: enableFileLogs
      ? createFileLogger({
          dir: env.logDir,
          level: env.logLevel,
          console: true,
        })
      : false,
    exposeErrorDetails: isDev,
  });

  app.get("/health", async (_req, reply) => {
    return ok(reply, {
      service: "traverior-api",
      architecture: "modular-monolith",
      framework: "fastify",
      auth: env.authMode,
      providers: env.providers,
    });
  });

  await app.register(auth.routes, { prefix: "/v1/auth" });
  await app.register(flights.routes, { prefix: "/v1/flights" });
  await app.register(hotels.routes, { prefix: "/v1/hotels" });
  await app.register(places.routes, { prefix: "/v1/places" });
  await app.register(routes.routes, { prefix: "/v1/routes" });
  await app.register(weather.routes, { prefix: "/v1/weather" });
  await app.register(events.routes, { prefix: "/v1/events" });
  await app.register(visa.routes, { prefix: "/v1/visa" });
  await app.register(checklist.routes, { prefix: "/v1/checklist" });
  await app.register(journey.routes, { prefix: "/v1/trips" });
  await app.register(createPlannerRoutes(planner), { prefix: "/v1/planner" });

  return {
    env,
    app,
    resolveAuth: auth.resolveAuth,
    services: {
      auth: auth.service,
      flights: flights.service,
      hotels: hotels.service,
      places: places.service,
      routes: routes.service,
      weather: weather.service,
      events: events.service,
      visa: visa.service,
      checklist: checklist.service,
      journey: journey.service,
      cost,
      policy,
      planner,
    },
  };
}
