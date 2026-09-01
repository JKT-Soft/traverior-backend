import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadEnv } from "../../config/env.js";
import { baseEnv } from "../../test/helpers.js";
import { createImageModule, createImageProvider } from "./index.js";

describe("createImageModule / createImageProvider", () => {
  it("wires mock provider", () => {
    const env = loadEnv(baseEnv());
    assert.equal(createImageProvider(env).name, "mock");
    assert.equal(createImageModule(env).service.providerName, "mock");
  });

  it("wires unsplash provider", () => {
    assert.equal(
      createImageModule(
        loadEnv(baseEnv({ PROVIDER_IMAGES: "unsplash", UNSPLASH_ACCESS_KEY: "k" })),
      ).service.providerName,
      "unsplash",
    );
  });

  it("throws on unknown provider", () => {
    assert.throws(
      () => createImageModule(loadEnv(baseEnv({ PROVIDER_IMAGES: "x" }))),
      /PROVIDER_IMAGES/,
    );
  });
});
