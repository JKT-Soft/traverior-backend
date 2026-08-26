import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMockFn, buildTestApp, injectJson } from "../../test/helpers.js";
import { createPlannerRoutes } from "./http.js";
import { HeuristicLlmClient } from "./infra/heuristic-llm.js";
import { PlannerService } from "./service.js";

describe("planner http", () => {
  it("enrich-city and skeleton validate and succeed", async () => {
    const deps = {
      llm: new HeuristicLlmClient(),
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

    const badEnrich = await injectJson(app, "POST", "/enrich-city", { body: {} });
    assert.equal(badEnrich.statusCode, 400);

    const okEnrich = await injectJson(app, "POST", "/enrich-city", {
      body: { city: "Osaka", checkIn: "2026-10-01", checkOut: "2026-10-04" },
    });
    assert.equal(okEnrich.statusCode, 200);

    const badSkel = await injectJson(app, "POST", "/skeleton", { body: {} });
    assert.equal(badSkel.statusCode, 400);

    const okSkel = await injectJson(app, "POST", "/skeleton", {
      body: {
        prompt: "Liburan ke Jepang peak season, budget affordable",
        preferences: { originCity: "Jakarta", partySize: 2 },
      },
    });
    assert.equal(okSkel.statusCode, 200);
    const body = JSON.parse(okSkel.body) as {
      data: { skeleton: { checkpoints: unknown[] }; llm: string };
    };
    assert.equal(body.data.llm, "heuristic");
    assert.ok(body.data.skeleton.checkpoints.length > 0);

    await app.close();
  });
});
