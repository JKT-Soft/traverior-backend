import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TemplateChecklistProvider } from "../infra/template-provider.js";
import { ChecklistService } from "./service.js";

describe("ChecklistService", () => {
  it("generate + providerName", async () => {
    const service = new ChecklistService(new TemplateChecklistProvider());
    assert.equal(
      (
        await service.generate({
          destination: "Osaka",
          visaDocuments: ["eVisa"],
        })
      ).items[0]?.source,
      "visa",
    );
    assert.equal(service.providerName, "internal");
  });
});
