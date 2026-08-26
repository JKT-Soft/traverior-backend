import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError, ValidationError } from "../../shared/http/errors.js";
import { createMockFn } from "../../test/helpers.js";
import type { LlmClient } from "./domain/ports.js";
import { HeuristicLlmClient } from "./infra/heuristic-llm.js";
import { PlannerService } from "./service.js";

function domainDeps(llm: LlmClient) {
  return {
    llm,
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
}

describe("PlannerService", () => {
  it("enrichCity with and without coords", async () => {
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
