import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MockHotelProvider } from "./mock-provider.js";

describe("MockHotelProvider", () => {
  it("returns city-named estimate", async () => {
    const p = new MockHotelProvider();
    assert.equal(p.name, "mock");
    const hotels = await p.searchHotels({
      cityName: "Osaka",
      checkIn: "2026-10-01",
      checkOut: "2026-10-04",
    });
    assert.match(hotels[0]?.name ?? "", /Osaka/);
    assert.equal(hotels[0]?.price.isEstimate, true);
  });
});
