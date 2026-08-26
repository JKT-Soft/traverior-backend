import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MockHotelProvider } from "../infra/mock-provider.js";
import { HotelService } from "./service.js";

describe("HotelService", () => {
  it("search + providerName", async () => {
    const service = new HotelService(new MockHotelProvider());
    assert.match(
      (
        await service.search({
          cityName: "Osaka",
          checkIn: "2026-10-01",
          checkOut: "2026-10-04",
        })
      )[0]?.name ?? "",
      /Osaka/,
    );
    assert.equal(service.providerName, "mock");
  });
});
