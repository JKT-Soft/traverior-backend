import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StaticVisaProvider } from "../infra/static-provider.js";
import { VisaService } from "./service.js";

describe("VisaService", () => {
  it("getRequirements + providerName", async () => {
    const service = new VisaService(new StaticVisaProvider());
    assert.ok(
      (
        await service.getRequirements({
          passportCountry: "ID",
          destinationCountry: "JP",
        })
      ).documents.length > 0,
    );
    assert.equal(service.providerName, "static");
  });
});
