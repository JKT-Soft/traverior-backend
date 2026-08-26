import type { Env } from "../../../config/env.js";
import type { WeatherForecast, WeatherProvider, WeatherQuery } from "../domain/ports.js";

export class OpenWeatherProvider implements WeatherProvider {
  readonly name = "openweather";
  constructor(private readonly apiKey: string) {}

  async getForecast(query: WeatherQuery): Promise<WeatherForecast> {
    const url = new URL("https://api.openweathermap.org/data/3.0/onecall");
    url.searchParams.set("lat", String(query.lat));
    url.searchParams.set("lon", String(query.lon));
    url.searchParams.set("units", "metric");
    url.searchParams.set("exclude", "minutely");
    url.searchParams.set("appid", this.apiKey);

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`OpenWeather failed (${res.status}): ${await res.text()}`);
    }

    const json = (await res.json()) as {
      timezone?: string;
      current?: { temp?: number };
      daily?: Array<{ dt: number; temp?: { min?: number; max?: number }; weather?: Array<{ description?: string }> }>;
      alerts?: Array<{ event?: string; description?: string; start?: number; end?: number }>;
    };

    return {
      contentType: "weather",
      provider: this.name,
      fetchedAt: new Date().toISOString(),
      timezone: json.timezone,
      currentTempC: json.current?.temp,
      daily: (json.daily ?? []).slice(0, 7).map((d) => ({
        date: new Date(d.dt * 1000).toISOString().slice(0, 10),
        minC: d.temp?.min ?? 0,
        maxC: d.temp?.max ?? 0,
        summary: d.weather?.[0]?.description,
      })),
      alerts: (json.alerts ?? []).map((a) => ({
        event: a.event ?? "alert",
        description: a.description ?? "",
        start: a.start,
        end: a.end,
      })),
    };
  }
}

export function createOpenWeatherProvider(env: Env): WeatherProvider {
  const key = env.secrets.openWeatherApiKey;
  if (!key) throw new Error("OPENWEATHER_API_KEY required for PROVIDER_WEATHER=openweather");
  return new OpenWeatherProvider(key);
}
