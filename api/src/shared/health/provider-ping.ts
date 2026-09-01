import type { Env } from "../../config/env.js";

export type HealthMark = "✅" | "❌";

export type ProviderPing = {
  id: string;
  provider: string;
  ok: boolean;
  mark: HealthMark;
  skipped?: boolean;
  status?: number;
  ms: number;
  error?: string;
};

export type FetchLike = typeof fetch;

export const PROVIDER_PING_TIMEOUT_MS = 5000;
export const LLM_PING_TIMEOUT_MS = 12_000;

export function healthMark(ok: boolean): HealthMark {
  return ok ? "✅" : "❌";
}

export function skippedPing(id: string, provider: string): ProviderPing {
  return { id, provider, ok: true, mark: "✅", skipped: true, ms: 0 };
}

export async function pingHttp(
  id: string,
  provider: string,
  url: string,
  init: RequestInit,
  fetchImpl: FetchLike,
  timeoutMs = PROVIDER_PING_TIMEOUT_MS,
): Promise<ProviderPing> {
  const started = performance.now();
  try {
    const res = await fetchImpl(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(timeoutMs),
    });
    await res.body?.cancel?.().catch(() => undefined);
    const ms = Math.round(performance.now() - started);
    const ok = res.status >= 200 && res.status < 300;
    if (!ok) {
      return {
        id,
        provider,
        ok: false,
        mark: "❌",
        status: res.status,
        ms,
        error: `HTTP ${res.status}`,
      };
    }
    return { id, provider, ok: true, mark: "✅", status: res.status, ms };
  } catch (err) {
    const ms = Math.round(performance.now() - started);
    const error = err instanceof Error ? err.message : String(err);
    return { id, provider, ok: false, mark: "❌", ms, error };
  }
}

function missingKey(id: string, provider: string, envName: string): ProviderPing {
  return { id, provider, ok: false, mark: "❌", ms: 0, error: `missing ${envName}` };
}

async function pingFlights(env: Env, fetchImpl: FetchLike): Promise<ProviderPing> {
  const provider = env.providers.flights;
  if (provider !== "duffel") return skippedPing("flights", provider);
  const token = env.secrets.duffelAccessToken?.trim();
  if (!token) return missingKey("flights", provider, "DUFFEL_ACCESS_TOKEN");
  return pingHttp(
    "flights",
    provider,
    "https://api.duffel.com/air/airports?limit=1",
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Duffel-Version": "v2",
      },
    },
    fetchImpl,
  );
}

async function pingHotels(env: Env, fetchImpl: FetchLike): Promise<ProviderPing> {
  const provider = env.providers.hotels;
  if (provider !== "liteapi") return skippedPing("hotels", provider);
  const key = env.secrets.liteApiKey?.trim();
  if (!key) return missingKey("hotels", provider, "LITEAPI_KEY");
  return pingHttp(
    "hotels",
    provider,
    "https://api.liteapi.travel/v3.0/data/currencies",
    {
      headers: {
        Accept: "application/json",
        "X-API-Key": key,
      },
    },
    fetchImpl,
  );
}

async function pingPlaces(env: Env, fetchImpl: FetchLike): Promise<ProviderPing> {
  const provider = env.providers.places;
  if (provider !== "google") return skippedPing("places", provider);
  const key = env.secrets.googleMapsApiKey?.trim();
  if (!key) return missingKey("places", provider, "GOOGLE_MAPS_API_KEY");
  return pingHttp(
    "places",
    provider,
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.id",
      },
      body: JSON.stringify({ textQuery: "Jakarta", maxResultCount: 1 }),
    },
    fetchImpl,
  );
}

async function pingRoutes(env: Env, fetchImpl: FetchLike): Promise<ProviderPing> {
  const provider = env.providers.routes;
  if (provider !== "google") return skippedPing("routes", provider);
  const key = env.secrets.googleMapsApiKey?.trim();
  if (!key) return missingKey("routes", provider, "GOOGLE_MAPS_API_KEY");
  return pingHttp(
    "routes",
    provider,
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "routes.duration",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: -6.2, longitude: 106.816666 } } },
        destination: { location: { latLng: { latitude: -6.21, longitude: 106.82 } } },
        travelMode: "WALK",
      }),
    },
    fetchImpl,
  );
}

async function pingWeather(env: Env, fetchImpl: FetchLike): Promise<ProviderPing> {
  const provider = env.providers.weather;
  if (provider !== "openweather") return skippedPing("weather", provider);
  const key = env.secrets.openWeatherApiKey?.trim();
  if (!key) return missingKey("weather", provider, "OPENWEATHER_API_KEY");
  const url = new URL("https://api.openweathermap.org/data/2.5/weather");
  url.searchParams.set("lat", "0");
  url.searchParams.set("lon", "0");
  url.searchParams.set("appid", key);
  return pingHttp("weather", provider, url.toString(), {}, fetchImpl);
}

async function pingEvents(env: Env, fetchImpl: FetchLike): Promise<ProviderPing> {
  const provider = env.providers.events;
  if (provider === "eventbrite" || provider === "composite") {
    const token = env.secrets.eventbriteToken?.trim();
    if (!token) {
      if (provider === "composite") return skippedPing("events", provider);
      return missingKey("events", provider, "EVENTBRITE_TOKEN");
    }
    return pingHttp(
      "events",
      provider,
      "https://www.eventbriteapi.com/v3/users/me/",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
      fetchImpl,
    );
  }
  return skippedPing("events", provider);
}

async function pingVisa(env: Env): Promise<ProviderPing> {
  return skippedPing("visa", env.providers.visa);
}

async function pingImages(env: Env, fetchImpl: FetchLike): Promise<ProviderPing> {
  const provider = env.providers.images;
  if (provider !== "unsplash") return skippedPing("images", provider);
  const key = env.secrets.unsplashAccessKey?.trim();
  if (!key) return missingKey("images", provider, "UNSPLASH_ACCESS_KEY");
  return pingHttp(
    "images",
    provider,
    "https://api.unsplash.com/stats/total",
    {
      headers: {
        Authorization: `Client-ID ${key}`,
        "Accept-Version": "v1",
      },
    },
    fetchImpl,
  );
}

async function pingLlm(env: Env, fetchImpl: FetchLike): Promise<ProviderPing> {
  const provider = env.llm.provider;
  if (provider !== "openai") return skippedPing("llm", provider);
  const key = env.openaiApiKey?.trim();
  if (!key) return missingKey("llm", provider, "OPENAI_API_KEY");
  const base = (env.llm.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = encodeURIComponent(env.llm.model);
  return pingHttp(
    "llm",
    provider,
    `${base}/models/${model}`,
    {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
    },
    fetchImpl,
    LLM_PING_TIMEOUT_MS,
  );
}

export async function pingExternalProviders(
  env: Env,
  fetchImpl: FetchLike = fetch,
): Promise<{ status: "ok" | "degraded"; mark: HealthMark; checks: ProviderPing[] }> {
  const checks = await Promise.all([
    pingFlights(env, fetchImpl),
    pingHotels(env, fetchImpl),
    pingPlaces(env, fetchImpl),
    pingRoutes(env, fetchImpl),
    pingWeather(env, fetchImpl),
    pingEvents(env, fetchImpl),
    pingVisa(env),
    pingImages(env, fetchImpl),
    pingLlm(env, fetchImpl),
  ]);
  const ok = checks.every((c) => c.ok);
  return {
    status: ok ? "ok" : "degraded",
    mark: healthMark(ok),
    checks,
  };
}
