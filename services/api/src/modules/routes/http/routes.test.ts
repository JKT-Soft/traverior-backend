import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadEnv } from "../../../config/env.js";
import { baseEnv, buildTestApp, injectJson } from "../../../test/helpers.js";
import { createRouteModule } from "../index.js";

describe("route routes", () => {
  it("health + validation + compute", async () => {
    const mod = createRouteModule(loadEnv(baseEnv()));
    const app = await buildTestApp(mod.routes);

    await injectJson(app, "GET", "/health");

    const bad = await injectJson(app, "POST", "/compute", { body: {} });
    assert.equal(bad.statusCode, 400);

    await injectJson(app, "POST", "/compute", {
      body: {
        originLat: 1,
        originLng: 2,
        destinationLat: 3,
        destinationLng: 4,
        mode: "WALK",
      },
    });

    await app.close();
  });
});
