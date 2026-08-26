import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MockPlaceProvider } from "../infra/mock-provider.js";
import { PlaceService } from "./service.js";

describe("PlaceService", () => {
  it("search helpers + providerName", async () => {
    const service = new PlaceService(new MockPlaceProvider());
    assert.ok((await service.searchRestaurants("Osaka", ["halal"]))[0]?.name);
    assert.ok((await service.searchPois("Osaka")).length > 0);
    assert.ok((await service.search({ textQuery: "cafe" })).length > 0);
    assert.equal(service.providerName, "mock");
  });
});
