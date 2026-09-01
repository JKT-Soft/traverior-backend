import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MockRouteProvider } from "../infra/mock-provider.js";
import { RouteService } from "./service.js";

describe("RouteService", () => {
  it("getRoute + providerName", async () => {
    const service = new RouteService(new MockRouteProvider());
    assert.equal(
      (
        await service.getRoute({
          originLat: 1,
          originLng: 2,
          destinationLat: 3,
          destinationLng: 4,
        })
      ).durationMinutes,
      42,
    );
    assert.equal(service.providerName, "mock");
  });
});
