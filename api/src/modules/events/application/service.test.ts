import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MockEventProvider } from "../infra/mock-provider.js";
import { EventService } from "./service.js";

describe("EventService", () => {
  it("search + providerName", async () => {
    const service = new EventService(new MockEventProvider());
    assert.equal((await service.search({ city: "Osaka" })).length, 2);
    assert.equal(service.providerName, "mock");
  });
});
