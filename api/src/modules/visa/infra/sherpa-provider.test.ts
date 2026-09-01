import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadEnv } from "../../../config/env.js";
import { baseEnv } from "../../../test/helpers.js";
import {
  createVisaProvider,
  SherpaVisaProvider,
} from "./sherpa-provider.js";

describe("SherpaVisaProvider / createVisaProvider", () => {
  it("requires SHERPA key and throws not-wired", async () => {
    assert.throws(
      () => createVisaProvider(loadEnv(baseEnv({ PROVIDER_VISA: "sherpa" }))),
      /SHERPA/,
    );
    assert.equal(
      createVisaProvider(
        loadEnv(baseEnv({ PROVIDER_VISA: "sherpa", SHERPA_API_KEY: "k" })),
      ).name,
      "sherpa",
    );

    const sherpa = new SherpaVisaProvider("k");
    await assert.rejects(
      () =>
        sherpa.getRequirements({
          passportCountry: "ID",
          destinationCountry: "JP",
        }),
      /not fully wired/,
    );
  });

  it("throws on unknown provider", () => {
    assert.throws(
      () => createVisaProvider(loadEnv(baseEnv({ PROVIDER_VISA: "x" }))),
      /PROVIDER_VISA/,
    );
  });
});
