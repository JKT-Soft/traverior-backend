import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MockPlaceProvider } from "./mock-provider.js";

describe("MockPlaceProvider", () => {
  it("returns place for query", async () => {
    const p = new MockPlaceProvider();
    assert.equal(p.name, "mock");
    const places = await p.searchPlaces({ textQuery: "cafe" });
    assert.ok(places[0]?.name.includes("cafe"));
  });
});
