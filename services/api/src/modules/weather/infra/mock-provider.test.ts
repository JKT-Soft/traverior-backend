import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MockWeatherProvider } from "./mock-provider.js";

describe("MockWeatherProvider", () => {
  it("returns forecast", async () => {
    const p = new MockWeatherProvider();
    assert.equal(p.name, "mock");
    const f = await p.getForecast({ lat: 1, lon: 2 });
    assert.equal(f.contentType, "weather");
    assert.equal(f.currentTempC, 24);
  });
});
