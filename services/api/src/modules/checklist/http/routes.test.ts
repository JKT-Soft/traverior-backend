import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTestApp, injectJson } from "../../../test/helpers.js";
import { createChecklistModule } from "../index.js";

describe("checklist routes", () => {
  it("health + validation + generate", async () => {
    const checklist = createChecklistModule();
    const app = await buildTestApp(checklist.routes);

    await injectJson(app, "GET", "/health");

    const bad = await injectJson(app, "POST", "/generate", { body: {} });
    assert.equal(bad.statusCode, 400);

    await injectJson(app, "POST", "/generate", {
      body: { destination: "Osaka" },
    });

    await app.close();
  });
});
