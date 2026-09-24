import type { CacheStore } from "../../shared/cache/index.js";
import { CurrencyService, type ExchangeRateClient } from "./application/service.js";
import { createCurrencyRoutes } from "./http/routes.js";

export function createCurrencyModule(cache?: CacheStore, fetchRates?: ExchangeRateClient) {
  const service = new CurrencyService(cache, fetchRates);
  return { service, routes: createCurrencyRoutes(service) };
}
