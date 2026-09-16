import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError, ValidationError } from "../../shared/http/errors.js";
import { InProcessMcpClient } from "../../shared/mcp/index.js";
import { createMockFn } from "../../test/helpers.js";
import { APPLICATION_LOG_TYPE } from "../../shared/logging/application-log-types.js";
import type { LlmClient } from "./domain/ports.js";
import { HeuristicLlmClient } from "./infra/heuristic-llm.js";
import { PlannerService } from "./service.js";

function domainServices() {
  return {
    flights: { search: createMockFn(async () => []), providerName: "mock" },
    hotels: { search: createMockFn(async () => [{ id: "h1" }]), providerName: "mock" },
    places: { searchRestaurants: createMockFn(async () => []), providerName: "mock", searchPois: createMockFn(async () => []), search: createMockFn(async () => []) },
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
}

function domainDeps(llm: LlmClient) {
  const services = domainServices();
  return {
    llm,
    mcp: new InProcessMcpClient(services),
    ...services,
  };
}

describe("PlannerService", () => {
  it("enrichCity with and without coords via MCP", async () => {
    const deps = domainDeps(new HeuristicLlmClient());
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
    assert.equal(withCoords.mcp, "inprocess");
    assert.ok(withCoords.route);
    assert.ok(deps.hotels.search.mock.calls.length > 0);
    assert.ok(deps.weather.getForecast.mock.calls.length > 0);

    const noCoords = await planner.enrichCity({
      city: "Osaka",
      checkIn: "2026-10-01",
      checkOut: "2026-10-04",
    });
    assert.equal(noCoords.route, null);
    assert.equal(noCoords.weather, null);
  });

  it("executeSkeletonNeeds runs MCP tools", async () => {
    const planner = new PlannerService(domainDeps(new HeuristicLlmClient()) as never);
    const out = await planner.executeSkeletonNeeds(
      {
        title: "Osaka",
        checkpoints: [
          {
            city: "Osaka",
            countryCode: "JP",
            role: "STAY",
            days: 2,
            needs: ["hotels", "visa", "checklist"],
          },
        ],
      },
      { checkIn: "2026-10-01", checkOut: "2026-10-03", passportCountry: "ID" },
    );
    assert.equal(out.mcp, "inprocess");
    assert.equal(out.checkpoints.length, 1);
    assert.ok(out.checkpoints[0]!.results.some((r) => r.tool === "search_hotels" && r.ok));
  });

  it("planSkeleton uses preference origin when prompt omits departure", async () => {
    const planner = new PlannerService(domainDeps(new HeuristicLlmClient()) as never);
    const { skeleton } = await planner.planSkeleton(
      {
        prompt: "Saya ingin liburan ke Jepang",
        preferences: { originCity: "Surabaya" },
      },
      { preferences: { originCity: "Surabaya" } },
    );
    assert.equal(skeleton.originCity, "Surabaya");
  });

  it("extractPlanSlots parses natural-language Japan dates without MCP", async () => {
    const planner = new PlannerService(domainDeps(new HeuristicLlmClient()) as never);
    const result = await planner.extractPlanSlots({
      prompt: "Saya mau liburan ke jepang 3 hari di hari pertama bulan kedua tahun ini",
      preferences: { originCity: "Surabaya" },
      today: new Date("2026-09-02T00:00:00Z"),
    });
    assert.equal(result.llm, "heuristic");
    assert.ok(result.extracted.destination);
    assert.equal(result.extracted.startDate, "2027-02-01");
    assert.equal(result.extracted.endDate, "2027-02-03");
    assert.equal(
      result.missing.some((item) => item.severity === "required"),
      false,
    );
  });

  it("extractPlanSlots asks for destination and dates on a vague prompt", async () => {
    const planner = new PlannerService(domainDeps(new HeuristicLlmClient()) as never);
    const result = await planner.extractPlanSlots({
      prompt: "Saya ingin liburan",
      today: new Date("2026-09-02T00:00:00Z"),
    });
    assert.ok(result.missing.some((item) => item.field === "destination" && item.severity === "required"));
    assert.ok(result.missing.some((item) => item.field === "startDate" && item.severity === "required"));
  });

  it("planSkeleton omits invented calendar dates", async () => {
    const planner = new PlannerService(domainDeps(new HeuristicLlmClient()) as never);
    const { skeleton } = await planner.planSkeleton({
      prompt: "Saya ingin liburan ke Jepang",
    });
    assert.equal(skeleton.assumedStartDate, undefined);
    assert.equal(skeleton.assumedEndDate, undefined);
  });

  it("planSkeleton via heuristic llm", async () => {
    const planner = new PlannerService(domainDeps(new HeuristicLlmClient()) as never);
    const { skeleton, llm } = await planner.planSkeleton({
      prompt: "Saya ingin liburan ke tempat terpopuler di Jepang dengan budget affordable",
      preferences: { originCity: "Jakarta", partySize: 2, budgetTone: "budget" },
    });
    assert.equal(llm, "heuristic");
    assert.ok(skeleton.checkpoints.length >= 2);
    assert.equal(skeleton.checkpoints[0]?.city, "Tokyo");
    assert.ok(skeleton.checkpoints[0]?.needs.includes("flights"));
  });

  it("logs the normalized skeleton after creation", async () => {
    const records: Array<Record<string, unknown>> = [];
    const planner = new PlannerService({
      ...domainDeps(new HeuristicLlmClient()),
      logs: {
        record: async (input: Record<string, unknown>) => {
          records.push(input);
        },
      },
    } as never);

    const { skeleton } = await planner.planSkeleton(
      { prompt: "liburan ke singapore", preferences: { originCity: "Jakarta" } },
      {},
      { tripId: "trip-1", userId: "user-1" },
    );

    assert.equal(records[0]?.type, APPLICATION_LOG_TYPE.PLAN_SKELETON);
    assert.equal(records[0]?.tripId, "trip-1");
    assert.deepEqual(records[0]?.result, skeleton);
  });

  it("planSkeleton for singapore does not route to japan", async () => {
    const planner = new PlannerService(domainDeps(new HeuristicLlmClient()) as never);
    const { skeleton } = await planner.planSkeleton({
      prompt: "liburan ke singapore",
      preferences: { originCity: "Jakarta" },
    });
    assert.equal(skeleton.checkpoints[0]?.city, "Singapore");
    assert.equal(skeleton.destinationSummary, "Singapore");
  });

  it("planSkeleton rejects empty prompt", async () => {
    const planner = new PlannerService(domainDeps(new HeuristicLlmClient()) as never);
    await assert.rejects(() => planner.planSkeleton({ prompt: "  " }), ValidationError);
  });

  it("planSkeleton rejects invalid llm json", async () => {
    const llm: LlmClient = {
      name: "bad",
      completeJson: async () => "not-json",
    };
    const planner = new PlannerService(domainDeps(llm) as never);
    await assert.rejects(() => planner.planSkeleton({ prompt: "trip to Japan" }), AppError);
  });

  it("planSkeleton rejects schema-invalid json", async () => {
    const llm: LlmClient = {
      name: "bad-shape",
      completeJson: async () => JSON.stringify({ title: "x", checkpoints: [] }),
    };
    const planner = new PlannerService(domainDeps(llm) as never);
    await assert.rejects(() => planner.planSkeleton({ prompt: "trip" }), /LLM_INVALID_SKELETON|skeleton/);
  });

  it("strips markdown fences from llm output", async () => {
    const llm: LlmClient = {
      name: "fenced",
      completeJson: async () =>
        "```json\n" +
        JSON.stringify({
          title: "Fenced",
          checkpoints: [
            { city: "Osaka", role: "STAY", days: 2, needs: ["hotels"] },
          ],
        }) +
        "\n```",
    };
    const planner = new PlannerService(domainDeps(llm) as never);
    const { skeleton } = await planner.planSkeleton({ prompt: "Osaka trip" });
    assert.equal(skeleton.title, "Fenced");
  });
});
