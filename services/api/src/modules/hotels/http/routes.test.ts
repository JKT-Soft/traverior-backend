import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadEnv } from "../../../config/env.js";
import { baseEnv, buildTestApp, injectJson } from "../../../test/helpers.js";
import { createHotelModule } from "../index.js";

describe("hotel routes", () => {
  it("health + validation + search", async () => {
    const mod = createHotelModule(loadEnv(baseEnv()));
    const app = await buildTestApp(mod.routes);

    await injectJson(app, "GET", "/health");

    const bad = await injectJson(app, "POST", "/search", { body: {} });
    assert.equal(bad.statusCode, 400);

    const res = await injectJson(app, "POST", "/search", {
      body: { cityName: "Osaka", checkIn: "2026-10-01", checkOut: "2026-10-04" },
    });
    assert.ok(res.json().data.hotels.length > 0);

    await app.close();
  });
});
