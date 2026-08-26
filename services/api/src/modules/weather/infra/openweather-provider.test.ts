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
    const urls: string[] = [];

    restoreFetch = stubFetch(async (input) => {
      urls.push(String(input));
      return { ok: false, status: 401, text: async () => "e" } as Response;
    });
    await assert.rejects(() => p.getForecast({ lat: 1, lon: 2 }), /OpenWeather/);
    assert.ok(urls.some((u) => u.includes("/data/2.5/forecast")));

    restoreFetch();
    urls.length = 0;
    restoreFetch = stubFetch(async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/data/2.5/weather")) {
        return {
          ok: true,
          json: async () => ({ main: { temp: 21.5 } }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          city: { name: "Osaka" },
          list: [
            {
              dt: Date.UTC(2026, 9, 1, 3) / 1000,
              main: { temp: 18, temp_min: 16, temp_max: 19 },
              weather: [{ description: "clouds" }],
            },
            {
              dt: Date.UTC(2026, 9, 1, 12) / 1000,
              main: { temp: 24, temp_min: 20, temp_max: 26 },
              weather: [{ description: "clear sky" }],
            },
            {
              dt: Date.UTC(2026, 9, 2, 12) / 1000,
              main: { temp: 22, temp_min: 19, temp_max: 23 },
              weather: [{ description: "rain" }],
            },
            { dt: Date.UTC(2026, 9, 2, 15) / 1000 },
          ],
        }),
      } as Response;
    });

    const f = await p.getForecast({ lat: 34.69, lon: 135.5 });
    assert.ok(urls.some((u) => u.includes("/data/2.5/forecast")));
    assert.ok(urls.some((u) => u.includes("/data/2.5/weather")));
    assert.equal(f.currentTempC, 21.5);
    assert.equal(f.timezone, "Osaka");
    assert.equal(f.daily.length, 2);
    assert.equal(f.daily[0]?.date, "2026-10-01");
    assert.equal(f.daily[0]?.minC, 16);
    assert.equal(f.daily[0]?.maxC, 26);
    assert.equal(f.daily[0]?.summary, "clear sky");
    assert.deepEqual(f.alerts, []);

    restoreFetch();
    restoreFetch = stubFetch(async (input) => {
      const url = String(input);
      if (url.includes("/data/2.5/weather")) {
        return { ok: false, status: 500, text: async () => "x" } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
    const empty = await p.getForecast({ lat: 1, lon: 2 });
    assert.deepEqual(empty.daily, []);
    assert.equal(empty.currentTempC, undefined);
    assert.deepEqual(empty.alerts, []);
  });
});
