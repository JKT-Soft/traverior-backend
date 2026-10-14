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

  it("adds destination-specific local items for Japan and Taiwan", async () => {
    const p = new TemplateChecklistProvider();
    const osaka = await p.generate({ destination: "Osaka", countryCode: "JP" });
    assert.ok(osaka.items.some((i) => i.id === "ic-card"));
    assert.ok(osaka.items.some((i) => i.id === "offline-maps"));

    const taipei = await p.generate({ destination: "Taipei", countryCode: "TW" });
    assert.ok(taipei.items.some((i) => i.id === "easycard"));
    assert.ok(taipei.items.some((i) => i.id === "night-market"));
  });
});
