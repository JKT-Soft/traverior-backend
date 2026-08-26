import type { Env } from "../../config/env.js";
import { HotelService } from "./application/service.js";
import type { HotelProvider } from "./domain/ports.js";
import { createHotelRoutes } from "./http/routes.js";
import { createLiteApiHotelProvider } from "./infra/liteapi-provider.js";
import { MockHotelProvider } from "./infra/mock-provider.js";

export function createHotelProvider(env: Env): HotelProvider {
  switch (env.providers.hotels) {
    case "liteapi":
      return createLiteApiHotelProvider(env);
    case "mock":
      return new MockHotelProvider();
    default:
      throw new Error(`Unknown PROVIDER_HOTELS: ${env.providers.hotels}`);
  }
}

export function createHotelModule(env: Env) {
  const service = new HotelService(createHotelProvider(env));
  return { service, routes: createHotelRoutes(service) };
}
