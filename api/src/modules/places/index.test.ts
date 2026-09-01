import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadEnv } from "../../config/env.js";
import { baseEnv } from "../../test/helpers.js";
import { createPlaceModule, createPlaceProvider } from "./index.js";

describe("createPlaceModule / createPlaceProvider", () => {
  it("wires mock provider", () => {
    const env = loadEnv(baseEnv());
    assert.equal(createPlaceProvider(env).name, "mock");
    assert.equal(createPlaceModule(env).service.providerName, "mock");
  });

  it("wires google provider", () => {
    assert.equal(
      createPlaceModule(
        loadEnv(baseEnv({ PROVIDER_PLACES: "google", GOOGLE_MAPS_API_KEY: "k" })),
      ).service.providerName,
      "google_places",
    );
  });

  it("throws on unknown provider", () => {
    assert.throws(
      () => createPlaceModule(loadEnv(baseEnv({ PROVIDER_PLACES: "x" }))),
      /PROVIDER_PLACES/,
    );
  });
});
