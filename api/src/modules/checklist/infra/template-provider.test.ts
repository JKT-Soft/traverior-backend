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
    assert.ok(result.tips.length >= 4);
    assert.equal(result.tips[0]?.category, "getting_around");
    assert.match(result.tips[0]?.body ?? "", /Osaka/);
  });

  it("keeps only stop items when trip items are omitted", async () => {
    const p = new TemplateChecklistProvider();
    const result = await p.generate({
      destination: "Kyoto",
      visaDocuments: ["eVisa"],
      omitTripItems: true,
    });
    assert.deepEqual(
      result.items.map((item) => item.id),
      ["hotel"],
    );
    assert.match(result.tips[0]?.body ?? "", /Kyoto/);
  });
});
