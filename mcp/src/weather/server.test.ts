import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFakeMcpServer, parseToolPayload } from "../test/helpers.js";
import { registerWeatherTools } from "./server.js";

describe("registerWeatherTools", () => {
  it("forecast, alerts default, and errors", async () => {
    const fake = createFakeMcpServer();
    let fail = false;
    let withAlerts = true;
    await registerWeatherTools(fake.server, async (rel) => {
      if (rel.includes("config/env")) return { loadEnv: () => ({}) };
      return {
        createWeatherModule: () => ({
          service: {
            providerName: "mock",
            getForecast: async () => {
              if (fail) throw new Error("wx");
              return withAlerts ? { alerts: [{ event: "Storm" }] } : {};
            },
          },
        }),
      };
    });

    assert.equal(
      parseToolPayload((await fake.call("get_forecast", { lat: 1, lon: 2 })) as never).ok,
      true,
    );
    const alerts = parseToolPayload(
      (await fake.call("get_weather_alerts", { lat: 1, lon: 2 })) as never,
    );
    assert.deepEqual((alerts.data as { alerts: unknown[] }).alerts, [{ event: "Storm" }]);

    withAlerts = false;
    const empty = parseToolPayload(
      (await fake.call("get_weather_alerts", { lat: 1, lon: 2 })) as never,
    );
    assert.deepEqual((empty.data as { alerts: unknown[] }).alerts, []);

    fail = true;
    assert.equal(
      parseToolPayload((await fake.call("get_forecast", { lat: 1, lon: 2 })) as never).ok,
      false,
    );
    assert.equal(
      parseToolPayload((await fake.call("get_weather_alerts", { lat: 1, lon: 2 })) as never)
        .ok,
      false,
    );
  });
});
