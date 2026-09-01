import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createMockFn, type MockFn } from "../../test/helpers.js";
import { CostService } from "./service.js";

function createPrismaMock(): {
  pipelineNode: {
    findMany: MockFn<(...args: never[]) => Promise<unknown>>;
    update: MockFn<(...args: never[]) => Promise<unknown>>;
  };
  trip: {
    update: MockFn<(...args: never[]) => Promise<unknown>>;
  };
} {
  return {
    pipelineNode: {
      findMany: createMockFn(async () => []),
      update: createMockFn(async () => ({})),
    },
    trip: {
      update: createMockFn(async () => ({})),
    },
  };
}

let prismaMock = createPrismaMock();

beforeEach(() => {
  prismaMock = createPrismaMock();
});

describe("CostService", () => {
  it("rollups nested costs", async () => {
    prismaMock.pipelineNode.findMany = createMockFn(async () => [
      { id: "root", parentId: null, costAmount: 0, durationMinutes: 0, depth: 0 },
      { id: "a", parentId: "root", costAmount: 0, durationMinutes: 0, depth: 1 },
      { id: "a1", parentId: "a", costAmount: 10, durationMinutes: 5, depth: 2 },
      { id: "a2", parentId: "a", costAmount: 5, durationMinutes: 2, depth: 2 },
    ]);
    prismaMock.pipelineNode.update = createMockFn(async () => ({}));
    prismaMock.trip.update = createMockFn(async () => ({}));
    await new CostService(prismaMock as never).rollupTrip("trip-1");
    assert.ok(prismaMock.pipelineNode.update.mock.calls.length > 0);
    assert.ok(prismaMock.trip.update.mock.calls.length > 0);

    prismaMock.pipelineNode.findMany = createMockFn(async () => []);
    await new CostService(prismaMock as never).rollupTrip("empty");
  });
});
