import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadEnv } from "../../../config/env.js";
import { baseEnv, buildTestApp, injectJson } from "../../../test/helpers.js";
import { createEventModule } from "../index.js";

describe("event routes", () => {
  it("health + validation + search", async () => {
    const mod = createEventModule(loadEnv(baseEnv()));
    const app = await buildTestApp(mod.routes);

    await injectJson(app, "GET", "/health");

    const bad = await injectJson(app, "POST", "/search", { body: {} });
    assert.equal(bad.statusCode, 400);

    await injectJson(app, "POST", "/search", { body: { city: "Osaka" } });

    await app.close();
  });
});
