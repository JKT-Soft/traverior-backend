import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadEnv } from "../../../config/env.js";
import { baseEnv, buildTestApp, injectJson } from "../../../test/helpers.js";
import { createWeatherModule } from "../index.js";

describe("weather routes", () => {
  it("health + validation + forecast", async () => {
    const mod = createWeatherModule(loadEnv(baseEnv()));
    const app = await buildTestApp(mod.routes);

    await injectJson(app, "GET", "/health");

    const bad = await injectJson(app, "POST", "/forecast", { body: {} });
    assert.equal(bad.statusCode, 400);

    await injectJson(app, "POST", "/forecast", { body: { lat: 1, lon: 2 } });

    await app.close();
  });
});
