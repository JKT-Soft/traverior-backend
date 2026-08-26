import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StaticVisaProvider } from "./static-provider.js";

describe("StaticVisaProvider", () => {
  it("ID→JP curated path and generic fallback", async () => {
    const staticP = new StaticVisaProvider();
    assert.equal(staticP.name, "static");
    assert.ok(
      (
        await staticP.getRequirements({
          passportCountry: "id",
          destinationCountry: "jp",
        })
      ).documents.length > 0,
    );
    assert.match(
      (
        await staticP.getRequirements({
          passportCountry: "US",
          destinationCountry: "FR",
        })
      ).summary,
      /Check/,
    );
  });
});
