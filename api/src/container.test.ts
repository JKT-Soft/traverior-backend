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

    const denied = await container.app.inject({
      method: "POST",
      url: "/v1/flights/search",
      headers: { "content-type": "application/json" },
      payload: { origin: "CGK", destination: "KIX", departureDate: "2026-10-01" },
    });
    assert.equal(denied.statusCode, 401);

    await container.app.close();
  });
});
