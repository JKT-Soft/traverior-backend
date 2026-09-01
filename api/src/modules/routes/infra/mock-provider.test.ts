import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MockRouteProvider } from "./mock-provider.js";

describe("MockRouteProvider", () => {
  it("returns fixed duration", async () => {
    const p = new MockRouteProvider();
    assert.equal(p.name, "mock");
    const r = await p.getRoute({
      originLat: 1,
      originLng: 2,
      destinationLat: 3,
      destinationLng: 4,
    });
    assert.equal(r.durationMinutes, 42);
    assert.equal(r.mode, "TRANSIT");
  });
});
