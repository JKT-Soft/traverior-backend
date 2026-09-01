import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadEnv } from "../../config/env.js";
import { baseEnv } from "../../test/helpers.js";
import { createHotelModule, createHotelProvider } from "./index.js";

describe("createHotelModule / createHotelProvider", () => {
  it("wires mock provider", () => {
    const env = loadEnv(baseEnv());
    assert.equal(createHotelProvider(env).name, "mock");
    assert.equal(createHotelModule(env).service.providerName, "mock");
  });

  it("wires liteapi provider", () => {
    assert.equal(
      createHotelModule(
        loadEnv(baseEnv({ PROVIDER_HOTELS: "liteapi", LITEAPI_KEY: "k" })),
      ).service.providerName,
      "liteapi",
    );
  });

  it("throws on unknown provider", () => {
    assert.throws(
      () => createHotelModule(loadEnv(baseEnv({ PROVIDER_HOTELS: "x" }))),
      /PROVIDER_HOTELS/,
    );
  });
});
