import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MockWeatherProvider } from "../infra/mock-provider.js";
import { WeatherService } from "./service.js";

describe("WeatherService", () => {
  it("getForecast + providerName", async () => {
    const service = new WeatherService(new MockWeatherProvider());
    assert.equal((await service.getForecast({ lat: 1, lon: 2 })).contentType, "weather");
    assert.equal(service.providerName, "mock");
  });
});
