import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadEnv } from "../../../config/env.js";
import { baseEnv, buildTestApp, injectJson } from "../../../test/helpers.js";
import { createPlaceModule } from "../index.js";

describe("place routes", () => {
  it("health + validation + search endpoints", async () => {
    const mod = createPlaceModule(loadEnv(baseEnv()));
    const app = await buildTestApp(mod.routes);

    await injectJson(app, "GET", "/health");

    const badSearch = await injectJson(app, "POST", "/search", { body: {} });
    assert.equal(badSearch.statusCode, 400);
    const badRestaurants = await injectJson(app, "POST", "/restaurants", { body: {} });
    assert.equal(badRestaurants.statusCode, 400);

    await injectJson(app, "POST", "/search", { body: { textQuery: "cafe" } });
    await injectJson(app, "POST", "/restaurants", { body: { city: "Osaka" } });

    await app.close();
  });
});
