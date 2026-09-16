import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadEnv } from "./config/env.js";
import { createContainer } from "./container.js";
import { swaggerBasicAuthHeader } from "./shared/http/swagger-basic-auth.js";
import { baseEnv } from "./test/helpers.js";

describe("createContainer", () => {
  it("mounts health and wires services", async () => {
    const container = await createContainer(loadEnv(baseEnv()));
    const health = await container.app.inject({ method: "GET", url: "/health" });
    assert.equal(health.statusCode, 200);
    assert.equal(health.json().data.service, "traverior-api");
    assert.equal(health.json().data.framework, "fastify");
    assert.equal(health.json().data.database.status, "skipped");
    assert.equal(health.json().data.database.ok, true);
    assert.equal(health.json().data.providerPings.status, "ok");
    assert.equal(health.json().data.mark, "✅");
    assert.equal(health.json().data.providerPings.mark, "✅");
    assert.ok(health.json().data.providerPings.checks.every((c: { mark: string }) => c.mark === "✅"));
    assert.equal(container.services.auth.providerName, "dev");
    assert.equal(typeof container.resolveAuth, "function");

    const denied = await container.app.inject({
      method: "POST",
      url: "/v1/flights/search",
      headers: { "content-type": "application/json" },
      payload: { origin: "CGK", destination: "KIX", departureDate: "2026-10-01" },
    });
    assert.equal(denied.statusCode, 401);

    const docs = await container.app.inject({ method: "GET", url: "/docs" });
    assert.equal(docs.statusCode, 200);

    const spec = await container.app.inject({ method: "GET", url: "/docs/json" });
    assert.equal(spec.statusCode, 200);
    const paths = spec.json().paths as Record<string, unknown>;
    for (const path of [
      "/health",
      "/v1/auth/me",
      "/v1/auth/test-token",
      "/v1/flights/search",
      "/v1/hotels/search",
      "/v1/places/search",
      "/v1/places/restaurants",
      "/v1/routes/compute",
      "/v1/weather/forecast",
      "/v1/events/search",
      "/v1/visa/requirements",
      "/v1/images/search",
      "/v1/images/location",
      "/v1/checklist/generate",
      "/v1/trips/",
      "/v1/trips/{tripId}",
      "/v1/trips/{tripId}/plan",
      "/v1/trips/{tripId}/nodes",
      "/v1/planner/plan",
      "/v1/profile/",
      "/v1/saved-places/",
      "/v1/saved-places/{id}",
    ]) {
      assert.ok(paths[path], `missing OpenAPI path ${path}`);
    }

    await container.app.close();
  });

  it("gates Swagger UI with basic auth when configured", async () => {
    const container = await createContainer(
      loadEnv(
        baseEnv({
          SWAGGER_BASIC_USER: "docs",
          SWAGGER_BASIC_PASSWORD: "secret",
        }),
      ),
    );

    const denied = await container.app.inject({ method: "GET", url: "/docs" });
    assert.equal(denied.statusCode, 401);

    const allowed = await container.app.inject({
      method: "GET",
      url: "/docs/json",
      headers: { authorization: swaggerBasicAuthHeader("docs", "secret") },
    });
    assert.equal(allowed.statusCode, 200);

    await container.app.close();
  });
});
