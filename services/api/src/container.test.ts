import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadEnv } from "./config/env.js";
import { createContainer } from "./container.js";
import { baseEnv } from "./test/helpers.js";

describe("createContainer", () => {
  it("mounts health and wires services", async () => {
    const container = await createContainer(loadEnv(baseEnv()));
    const health = await container.app.inject({ method: "GET", url: "/health" });
    assert.equal(health.statusCode, 200);
    assert.equal(health.json().data.service, "traverior-api");
    assert.equal(health.json().data.framework, "fastify");
    assert.equal(container.services.auth.providerName, "dev");
    assert.equal(typeof container.resolveAuth, "function");
    await container.app.close();
  });
});
