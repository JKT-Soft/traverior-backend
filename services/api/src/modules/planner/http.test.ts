import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMockFn, buildTestApp, injectJson } from "../../test/helpers.js";
import { createPlannerRoutes } from "./http.js";
import { PlannerService } from "./service.js";

describe("planner http", () => {
  it("enrich-city validates and succeeds", async () => {
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
    const app = await buildTestApp(createPlannerRoutes(planner));

    const bad = await injectJson(app, "POST", "/enrich-city", { body: {} });
    assert.equal(bad.statusCode, 400);

    const okRes = await injectJson(app, "POST", "/enrich-city", {
      body: { city: "Osaka", checkIn: "2026-10-01", checkOut: "2026-10-04" },
    });
    assert.equal(okRes.statusCode, 200);

    await app.close();
  });
});
