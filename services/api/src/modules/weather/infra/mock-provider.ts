import type { WeatherForecast, WeatherProvider, WeatherQuery } from "../domain/ports.js";

export class MockWeatherProvider implements WeatherProvider {
  readonly name = "mock";
  async getForecast(query: WeatherQuery): Promise<WeatherForecast> {
    return {
      contentType: "weather",
      provider: this.name,
      fetchedAt: new Date().toISOString(),
      currentTempC: 24,
      daily: [
        {
          date: new Date().toISOString().slice(0, 10),
          minC: 20,
          maxC: 28,
          summary: "Partly cloudy",
        },
      ],
      alerts: [],
    };
  }
}
