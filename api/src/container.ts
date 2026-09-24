import type { FastifyInstance } from "fastify";
import type { Env } from "./config/env.js";
import { createAuthModule } from "./modules/auth/index.js";
import { createChecklistModule } from "./modules/checklist/index.js";
import { createCurrencyModule } from "./modules/currency/index.js";
import { CostService } from "./modules/cost/service.js";
import { createEventModule } from "./modules/events/index.js";
import { createFlightModule } from "./modules/flights/index.js";
import { createHotelModule } from "./modules/hotels/index.js";
import { createImageModule } from "./modules/images/index.js";
import { createJourneyModule } from "./modules/journey/index.js";
import { createPlaceModule } from "./modules/places/index.js";
import { createPlannerRoutes } from "./modules/planner/http.js";
import { createProfileModule } from "./modules/profile/index.js";
import { createSavedPlaceModule } from "./modules/saved-places/index.js";
import { createLlmClient } from "./modules/planner/infra/create-llm.js";
import { PlannerService } from "./modules/planner/service.js";
import { PolicyService } from "./modules/policy/service.js";
import { createRouteModule } from "./modules/routes/index.js";
import { createVisaModule } from "./modules/visa/index.js";
import { createWeatherModule } from "./modules/weather/index.js";
import { createCacheStore, type CacheStore } from "./shared/cache/index.js";
import { createMcpClient, type McpToolClient } from "./shared/mcp/index.js";
import { buildApp, type AuthResolver } from "./shared/http/app.js";
import { pingExternalProviders } from "./shared/health/provider-ping.js";
import { registerOpenApi, routeDocs } from "./shared/http/openapi.js";
import { ok } from "./shared/http/reply.js";
import { createFileLogger } from "./shared/logging/logger.js";
import { ApplicationLogService } from "./shared/logging/application-log.js";
import { prisma } from "./infra/prisma/client.js";
import { pingDatabase } from "./shared/health/database-ping.js";

export type AppContainer = {
  env: Env;
  app: FastifyInstance;
  cache: CacheStore;
  mcp: McpToolClient;
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
    images: ReturnType<typeof createImageModule>["service"];
    checklist: ReturnType<typeof createChecklistModule>["service"];
    currency: ReturnType<typeof createCurrencyModule>["service"];
    journey: ReturnType<typeof createJourneyModule>["service"];
    profile: ReturnType<typeof createProfileModule>["service"];
    savedPlaces: ReturnType<typeof createSavedPlaceModule>["service"];
    cost: CostService;
    policy: PolicyService;
    planner: PlannerService;
  };
};

export async function createContainer(env: Env): Promise<AppContainer> {
  const cache = await createCacheStore(env);

  const auth = createAuthModule(env);
  const flights = createFlightModule(env, cache);
  const hotels = createHotelModule(env, cache);
  const places = createPlaceModule(env, cache);
  const routes = createRouteModule(env, cache);
  const weather = createWeatherModule(env, cache);
  const events = createEventModule(env, cache);
  const visa = createVisaModule(env, cache);
  const images = createImageModule(env, cache);
  const checklist = createChecklistModule();
  const currency = createCurrencyModule(cache);
  const cost = new CostService();
  const policy = new PolicyService();
  const logs = new ApplicationLogService(prisma);
  const llm = createLlmClient(env);
  const mcp = createMcpClient(env, {
    flights: flights.service,
    hotels: hotels.service,
    places: places.service,
    routes: routes.service,
    weather: weather.service,
    events: events.service,
    visa: visa.service,
    checklist: checklist.service,
  });

  const planner = new PlannerService({
    llm,
    mcp,
    flights: flights.service,
    hotels: hotels.service,
    places: places.service,
    routes: routes.service,
    weather: weather.service,
    events: events.service,
    visa: visa.service,
    checklist: checklist.service,
    logs,
  });

  const journey = createJourneyModule({
    env,
    cache,
    planner,
    cost,
    policy,
    images: images.service,
    logs,
  });
  const profile = createProfileModule();
  const savedPlaces = createSavedPlaceModule();

  const isDev = env.nodeEnv !== "production" && env.nodeEnv !== "test";
  const enableFileLogs = env.nodeEnv !== "test";
  const app = buildApp({
    auth: auth.resolveAuth,
    requireAuth: true,
    logger: enableFileLogs
      ? createFileLogger({
          dir: env.logDir,
          level: env.logLevel,
          console: true,
        })
      : false,
    exposeErrorDetails: isDev,
  });

  app.addHook("onClose", async () => {
    await cache.quit?.();
    await mcp.close?.();
  });

  await registerOpenApi(app, { basicAuth: env.swaggerBasicAuth });

  app.get(
    "/health",
    {
      schema: routeDocs({
        tags: ["Health"],
        summary: "API health",
        description: "Liveness plus short pings to the database and active external providers.",
        auth: false,
      }),
    },
    async (_req, reply) => {
      const [database, providerPings] = await Promise.all([
        pingDatabase(prisma, { skip: env.nodeEnv === "test" }),
        pingExternalProviders(env),
      ]);
      const healthy = database.ok && providerPings.status === "ok";
      return ok(reply, {
        service: "traverior-api",
        status: healthy ? "ok" : "degraded",
        mark: healthy ? "✅" : "❌",
        architecture: "modular-monolith",
        framework: "fastify",
        auth: env.authMode,
        database,
        llm: {
          provider: env.llm.provider,
          model: env.llm.model,
          client: llm.name,
        },
        mcp: {
          mode: env.mcp.mode,
          client: mcp.name,
          serversDir: env.mcp.serversDir,
        },
        cache: {
          enabled: env.cache.enabled,
          store: cache.name,
          ttl: env.cache.ttl,
        },
        providers: env.providers,
        providerPings,
      });
    },
  );
  await app.register(auth.routes, { prefix: "/v1/auth" });
  await app.register(flights.routes, { prefix: "/v1/flights" });
  await app.register(hotels.routes, { prefix: "/v1/hotels" });
  await app.register(places.routes, { prefix: "/v1/places" });
  await app.register(routes.routes, { prefix: "/v1/routes" });
  await app.register(weather.routes, { prefix: "/v1/weather" });
  await app.register(events.routes, { prefix: "/v1/events" });
  await app.register(visa.routes, { prefix: "/v1/visa" });
  await app.register(images.routes, { prefix: "/v1/images" });
  await app.register(checklist.routes, { prefix: "/v1/checklist" });
  await app.register(currency.routes, { prefix: "/v1/currency" });
  await app.register(journey.routes, { prefix: "/v1/trips" });
  await app.register(profile.routes, { prefix: "/v1/profile" });
  await app.register(savedPlaces.routes, { prefix: "/v1/saved-places" });
  await app.register(createPlannerRoutes(planner), { prefix: "/v1/planner" });

  return {
    env,
    app,
    cache,
    mcp,
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
      images: images.service,
      checklist: checklist.service,
      currency: currency.service,
      journey: journey.service,
      profile: profile.service,
      savedPlaces: savedPlaces.service,
      cost,
      policy,
      planner,
    },
  };
}
