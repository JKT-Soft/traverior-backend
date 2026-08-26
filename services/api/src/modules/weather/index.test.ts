import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadEnv } from "../../config/env.js";
import { baseEnv } from "../../test/helpers.js";
import { createWeatherModule, createWeatherProvider } from "./index.js";

describe("createWeatherModule / createWeatherProvider", () => {
  it("wires mock provider", () => {
    const env = loadEnv(baseEnv());
    assert.equal(createWeatherProvider(env).name, "mock");
    assert.equal(createWeatherModule(env).service.providerName, "mock");
  });

  it("wires openweather provider", () => {
    assert.equal(
      createWeatherModule(
        loadEnv(
          baseEnv({ PROVIDER_WEATHER: "openweather", OPENWEATHER_API_KEY: "k" }),
        ),
      ).service.providerName,
      "openweather",
    );
  });

  it("throws on unknown provider", () => {
    assert.throws(
      () => createWeatherModule(loadEnv(baseEnv({ PROVIDER_WEATHER: "x" }))),
      /PROVIDER_WEATHER/,
    );
  });
});
