import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InProcessMcpClient } from "../../shared/mcp/index.js";
import { createMockFn, buildTestApp, injectJson } from "../../test/helpers.js";
import { createPlannerRoutes } from "./http.js";
import { HeuristicLlmClient } from "./infra/heuristic-llm.js";
import { PlannerService } from "./service.js";

function plannerWithMcp() {
  const services = {
    flights: { search: createMockFn(async () => []), providerName: "mock" },
    hotels: { search: createMockFn(async () => []), providerName: "mock" },
    places: {
      searchRestaurants: createMockFn(async () => []),
      searchPois: createMockFn(async () => []),
      search: createMockFn(async () => []),
      providerName: "mock",
    },
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
  return new PlannerService({
    llm: new HeuristicLlmClient(),
    mcp: new InProcessMcpClient(services),
    ...services,
  } as never);
}

describe("planner http", () => {
  it("lists tools, calls tool, skeleton, execute, enrich-city", async () => {
    const planner = plannerWithMcp();
    const app = await buildTestApp(createPlannerRoutes(planner));

    const tools = await injectJson(app, "GET", "/tools");
    assert.equal(tools.statusCode, 200);
    assert.equal(tools.json().data.mcp, "inprocess");

    const call = await injectJson(app, "POST", "/tools/call", {
      body: {
        tool: "search_hotels",
        arguments: { cityName: "Osaka", checkIn: "2026-10-01", checkOut: "2026-10-04" },
      },
    });
    assert.equal(call.statusCode, 200);
    assert.equal(call.json().data.ok, true);

    const badEnrich = await injectJson(app, "POST", "/enrich-city", { body: {} });
    assert.equal(badEnrich.statusCode, 400);

    const okEnrich = await injectJson(app, "POST", "/enrich-city", {
      body: { city: "Osaka", checkIn: "2026-10-01", checkOut: "2026-10-04" },
    });
    assert.equal(okEnrich.statusCode, 200);

    const okSkel = await injectJson(app, "POST", "/skeleton", {
      body: {
        prompt: "Liburan ke Jepang peak season, budget affordable",
        preferences: { originCity: "Jakarta", partySize: 2 },
      },
    });
    assert.equal(okSkel.statusCode, 200);

    const skeleton = okSkel.json().data.skeleton;
    const exec = await injectJson(app, "POST", "/execute-skeleton", {
      body: {
        skeleton,
        context: { checkIn: "2026-10-01", checkOut: "2026-10-10", passportCountry: "ID" },
      },
    });
    assert.equal(exec.statusCode, 200);
    assert.ok(exec.json().data.checkpoints.length > 0);

    const plan = await injectJson(app, "POST", "/plan", {
      body: {
        prompt: "Trip ke Jepang",
        context: { checkIn: "2026-10-01", checkOut: "2026-10-10" },
      },
    });
    assert.equal(plan.statusCode, 200);
    assert.ok(plan.json().data.skeleton);
    assert.ok(plan.json().data.execution);

    await app.close();
  });
});
