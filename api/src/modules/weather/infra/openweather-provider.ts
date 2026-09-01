import type { Env } from "../../../config/env.js";
import type { WeatherForecast, WeatherProvider, WeatherQuery } from "../domain/ports.js";

type ForecastItem = {
  dt: number;
  main?: { temp?: number; temp_min?: number; temp_max?: number };
  weather?: Array<{ description?: string }>;
};

type ForecastResponse = {
  city?: { timezone?: number; name?: string };
  list?: ForecastItem[];
};

type CurrentResponse = {
  main?: { temp?: number };
  weather?: Array<{ description?: string }>;
};

function aggregateDaily(list: ForecastItem[]): WeatherForecast["daily"] {
  const byDay = new Map<
    string,
    { minC: number; maxC: number; summary?: string; noonDist: number }
  >();

  for (const item of list) {
    const date = new Date(item.dt * 1000).toISOString().slice(0, 10);
    const minC = item.main?.temp_min ?? item.main?.temp ?? 0;
    const maxC = item.main?.temp_max ?? item.main?.temp ?? 0;
    const summary = item.weather?.[0]?.description;
    const hour = new Date(item.dt * 1000).getUTCHours();
    const noonDist = Math.abs(hour - 12);

    const prev = byDay.get(date);
    if (!prev) {
      byDay.set(date, { minC, maxC, summary, noonDist });
      continue;
    }
    prev.minC = Math.min(prev.minC, minC);
    prev.maxC = Math.max(prev.maxC, maxC);
    if (noonDist < prev.noonDist && summary) {
      prev.summary = summary;
      prev.noonDist = noonDist;
    }
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 7)
    .map(([date, v]) => ({
      date,
      minC: v.minC,
      maxC: v.maxC,
      summary: v.summary,
    }));
}

/**
 * Uses free-tier OpenWeather endpoints (Current + 5-day/3-hour Forecast).
 * One Call 3.0 requires a separate paid subscription and is not used here.
 * Docs: https://openweathermap.org/forecast5
 */
export class OpenWeatherProvider implements WeatherProvider {
  readonly name = "openweather";
  constructor(private readonly apiKey: string) {}

  async getForecast(query: WeatherQuery): Promise<WeatherForecast> {
    const forecastUrl = new URL("https://api.openweathermap.org/data/2.5/forecast");
    forecastUrl.searchParams.set("lat", String(query.lat));
    forecastUrl.searchParams.set("lon", String(query.lon));
    forecastUrl.searchParams.set("units", "metric");
    forecastUrl.searchParams.set("appid", this.apiKey);

    const currentUrl = new URL("https://api.openweathermap.org/data/2.5/weather");
    currentUrl.searchParams.set("lat", String(query.lat));
    currentUrl.searchParams.set("lon", String(query.lon));
    currentUrl.searchParams.set("units", "metric");
    currentUrl.searchParams.set("appid", this.apiKey);

    const [forecastRes, currentRes] = await Promise.all([
      fetch(forecastUrl),
      fetch(currentUrl),
    ]);

    if (!forecastRes.ok) {
      throw new Error(`OpenWeather failed (${forecastRes.status}): ${await forecastRes.text()}`);
    }

    const forecastJson = (await forecastRes.json()) as ForecastResponse;
    let currentTempC: number | undefined;
    if (currentRes.ok) {
      const currentJson = (await currentRes.json()) as CurrentResponse;
      currentTempC = currentJson.main?.temp;
    }

    return {
      contentType: "weather",
      provider: this.name,
      fetchedAt: new Date().toISOString(),
      timezone: forecastJson.city?.name,
      currentTempC,
      daily: aggregateDaily(forecastJson.list ?? []),
      // Severe weather alerts require One Call 3.0 (paid) — keep empty on free tier
      alerts: [],
    };
  }
}

export function createOpenWeatherProvider(env: Env): WeatherProvider {
  const key = env.secrets.openWeatherApiKey;
  if (!key) throw new Error("OPENWEATHER_API_KEY required for PROVIDER_WEATHER=openweather");
  return new OpenWeatherProvider(key);
}
