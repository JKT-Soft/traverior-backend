import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMockFn } from "../../test/helpers.js";
import { PlannerService } from "./service.js";

describe("PlannerService", () => {
  it("enrichCity with and without coords", async () => {
    const deps = {
      flights: { search: createMockFn(async () => []), providerName: "mock" },
      hotels: { search: createMockFn(async () => []), providerName: "mock" },
      places: { searchRestaurants: createMockFn(async () => []), providerName: "mock" },
      routes: {
        getRoute: createMockFn(async () => ({ durationMinutes: 1 })),
        providerName: "mock",
      },
      weather: {
        getForecast: createMockFn(async () => ({ alerts: [] })),
        providerName: "mock",
      },
      events: { search: createMockFn(async () => []), providerName: "mock" },
      visa: {
        getRequirements: createMockFn(async () => ({ documents: ["passport"] })),
        providerName: "static",
      },
      checklist: {
        generate: createMockFn(async () => ({ items: [] })),
        providerName: "internal",
      },
    };
    const planner = new PlannerService(deps as never);
    const withCoords = await planner.enrichCity({
      city: "Osaka",
      countryCode: "JP",
      checkIn: "2026-10-01",
      checkOut: "2026-10-04",
      originLat: 1,
      originLng: 2,
      destLat: 3,
      destLng: 4,
      passportCountry: "ID",
      destinationCountry: "JP",
    });
    assert.ok(withCoords.route);
    assert.ok(deps.weather.getForecast.mock.calls.length > 0);

    const noCoords = await planner.enrichCity({
      city: "Osaka",
      checkIn: "2026-10-01",
      checkOut: "2026-10-04",
    });
    assert.equal(noCoords.route, null);
    assert.equal(noCoords.weather, null);
  });
});
