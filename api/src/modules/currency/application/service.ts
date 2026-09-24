import { ValidationError, AppError } from "../../../shared/http/errors.js";
import { cacheKey, getOrSet, type CacheStore } from "../../../shared/cache/index.js";

export type ExchangeRates = {
  base: string;
  rates: Record<string, number>;
};

export type ExchangeRateClient = (base: string) => Promise<ExchangeRates>;

const TTL_SECONDS = 60 * 60;

export class CurrencyService {
  constructor(
    private readonly cache?: CacheStore,
    private readonly fetchRates: ExchangeRateClient = fetchOpenErApi,
  ) {}

  readonly providerName = "er-api";

  async latest(base: string): Promise<ExchangeRates> {
    const code = base.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) {
      throw new ValidationError("Base currency must be a 3-letter code.");
    }

    return getOrSet(
      {
        cache: this.cache,
        key: cacheKey("currency", { base: code }),
        ttlSeconds: TTL_SECONDS,
      },
      () => this.fetchRates(code),
    );
  }
}

export async function fetchOpenErApi(base: string): Promise<ExchangeRates> {
  const response = await fetch(`https://open.er-api.com/v6/latest/${base}`);
  if (!response.ok) {
    throw new AppError(502, "Exchange rates are unavailable.", "EXCHANGE_RATE_UNAVAILABLE");
  }
  const body = (await response.json()) as {
    result?: string;
    rates?: Record<string, number>;
  };
  if (body.result !== "success" || !body.rates) {
    throw new AppError(502, "Exchange rates are unavailable.", "EXCHANGE_RATE_UNAVAILABLE");
  }
  const rates: Record<string, number> = { [base]: 1 };
  for (const [code, value] of Object.entries(body.rates)) {
    if (typeof value === "number" && value > 0) rates[code.toUpperCase()] = value;
  }
  return { base, rates };
}
