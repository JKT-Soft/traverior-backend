import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TemplateChecklistProvider } from "./template-provider.js";

describe("TemplateChecklistProvider", () => {
  it("merges visa docs ahead of template items", async () => {
    const p = new TemplateChecklistProvider();
    assert.equal(p.name, "internal");
    const result = await p.generate({
      destination: "Osaka",
      visaDocuments: ["eVisa"],
    });
    assert.equal(result.items[0]?.source, "visa");
    assert.ok(result.items.some((i) => i.source === "template"));
    assert.match(
      result.items.find((i) => i.id === "adapter")?.label ?? "",
      /Osaka/,
    );
  });
});
