import type { WeatherProvider, WeatherQuery } from "../domain/ports.js";

export class WeatherService {
  constructor(private readonly provider: WeatherProvider) {}
  getForecast(query: WeatherQuery) {
    return this.provider.getForecast(query);
  }
  get providerName() {
    return this.provider.name;
  }
}
