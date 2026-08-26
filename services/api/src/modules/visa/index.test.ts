import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadEnv } from "../../config/env.js";
import { baseEnv } from "../../test/helpers.js";
import { createVisaModule } from "./index.js";

describe("createVisaModule", () => {
  it("wires static provider", () => {
    assert.equal(createVisaModule(loadEnv(baseEnv())).service.providerName, "static");
  });

  it("wires sherpa provider", () => {
    assert.equal(
      createVisaModule(
        loadEnv(baseEnv({ PROVIDER_VISA: "sherpa", SHERPA_API_KEY: "k" })),
      ).service.providerName,
      "sherpa",
    );
  });

  it("throws on unknown provider", () => {
    assert.throws(
      () => createVisaModule(loadEnv(baseEnv({ PROVIDER_VISA: "x" }))),
      /PROVIDER_VISA/,
    );
  });
});
