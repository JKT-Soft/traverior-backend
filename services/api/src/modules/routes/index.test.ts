import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadEnv } from "../../config/env.js";
import { baseEnv } from "../../test/helpers.js";
import { createRouteModule, createRouteProvider } from "./index.js";

describe("createRouteModule / createRouteProvider", () => {
  it("wires mock provider", () => {
    const env = loadEnv(baseEnv());
    assert.equal(createRouteProvider(env).name, "mock");
    assert.equal(createRouteModule(env).service.providerName, "mock");
  });

  it("wires google provider", () => {
    assert.equal(
      createRouteModule(
        loadEnv(baseEnv({ PROVIDER_ROUTES: "google", GOOGLE_MAPS_API_KEY: "k" })),
      ).service.providerName,
      "google_routes",
    );
  });

  it("throws on unknown provider", () => {
    assert.throws(
      () => createRouteModule(loadEnv(baseEnv({ PROVIDER_ROUTES: "x" }))),
      /PROVIDER_ROUTES/,
    );
  });
});
