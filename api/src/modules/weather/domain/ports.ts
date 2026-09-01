import type { ProviderMeta } from "../../../shared/types/provider.js";

export type WeatherQuery = { lat: number; lon: number };

export type WeatherForecast = ProviderMeta & {
  contentType: "weather";
  timezone?: string;
  currentTempC?: number;
  daily: Array<{ date: string; minC: number; maxC: number; summary?: string }>;
  alerts: Array<{ event: string; description: string; start?: number; end?: number }>;
};

export interface WeatherProvider {
  readonly name: string;
  getForecast(query: WeatherQuery): Promise<WeatherForecast>;
}
