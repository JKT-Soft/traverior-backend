import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadEnv } from "../../../config/env.js";
import { baseEnv, buildTestApp, injectJson } from "../../../test/helpers.js";
import { createVisaModule } from "../index.js";

describe("visa routes", () => {
  it("health + validation + requirements", async () => {
    const visa = createVisaModule(loadEnv(baseEnv()));
    const app = await buildTestApp(visa.routes);

    await injectJson(app, "GET", "/health");

    const bad = await injectJson(app, "POST", "/requirements", { body: {} });
    assert.equal(bad.statusCode, 400);

    await injectJson(app, "POST", "/requirements", {
      body: { passportCountry: "ID", destinationCountry: "JP" },
    });

    await app.close();
  });
});
