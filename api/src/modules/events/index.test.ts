import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadEnv } from "../../config/env.js";
import { baseEnv } from "../../test/helpers.js";
import { createEventModule } from "./index.js";

describe("createEventModule", () => {
  it("wires mock provider", () => {
    assert.equal(createEventModule(loadEnv(baseEnv())).service.providerName, "mock");
  });

  it("wires eventbrite-only and composite providers", () => {
    assert.equal(
      createEventModule(
        loadEnv(baseEnv({ PROVIDER_EVENTS: "eventbrite", EVENTBRITE_TOKEN: "e" })),
      ).service.providerName,
      "eventbrite",
    );
    assert.equal(
      createEventModule(
        loadEnv(
          baseEnv({
            PROVIDER_EVENTS: "composite",
            EVENTBRITE_TOKEN: "e",
            VIATOR_API_KEY: "v",
          }),
        ),
      ).service.providerName,
      "eventbrite+viator",
    );
  });

  it("throws on unknown provider", () => {
    assert.throws(
      () => createEventModule(loadEnv(baseEnv({ PROVIDER_EVENTS: "x" }))),
      /PROVIDER_EVENTS/,
    );
  });
});
