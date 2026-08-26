import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { loadEnv } from "../../../config/env.js";
import { baseEnv, stubFetch } from "../../../test/helpers.js";
import {
  createOpenWeatherProvider,
  OpenWeatherProvider,
} from "./openweather-provider.js";

let restoreFetch: (() => void) | undefined;

afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});

describe("OpenWeatherProvider", () => {
  it("createOpenWeatherProvider requires key", () => {
    assert.throws(
      () =>
        createOpenWeatherProvider(loadEnv(baseEnv({ PROVIDER_WEATHER: "openweather" }))),
      /OPENWEATHER/,
    );
    assert.equal(
      createOpenWeatherProvider(
        loadEnv(
          baseEnv({ PROVIDER_WEATHER: "openweather", OPENWEATHER_API_KEY: "k" }),
        ),
      ).name,
      "openweather",
    );
  });

  it("error + success + empty collections", async () => {
    const p = new OpenWeatherProvider("k");

    restoreFetch = stubFetch(
      async () => ({ ok: false, status: 401, text: async () => "e" }) as Response,
    );
    await assert.rejects(() => p.getForecast({ lat: 1, lon: 2 }), /OpenWeather/);

    restoreFetch();
    restoreFetch = stubFetch(
      async () =>
        ({
          ok: true,
          json: async () => ({
            timezone: "Asia/Tokyo",
            current: { temp: 20 },
            daily: [
              {
                dt: 1_700_000_000,
                temp: { min: 10, max: 20 },
                weather: [{ description: "clear" }],
              },
              { dt: 1_700_086_400 },
            ],
            alerts: [{ event: "Storm", description: "bad", start: 1, end: 2 }, {}],
          }),
        }) as Response,
    );
    const f = await p.getForecast({ lat: 1, lon: 2 });
    assert.equal(f.alerts[0]?.event, "Storm");
    assert.equal(f.alerts[1]?.event, "alert");

    restoreFetch();
    restoreFetch = stubFetch(
      async () => ({ ok: true, json: async () => ({}) }) as Response,
    );
    const empty = await p.getForecast({ lat: 1, lon: 2 });
    assert.deepEqual(empty.daily, []);
    assert.deepEqual(empty.alerts, []);
  });
});
