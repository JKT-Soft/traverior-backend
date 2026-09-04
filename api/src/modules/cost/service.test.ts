import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createMockFn, type MockFn } from "../../test/helpers.js";
import { CostService } from "./service.js";

function createPrismaMock() {
  return {
    pipelineNode: {
      findMany: createMockFn(async () => []) as MockFn<(...args: never[]) => Promise<unknown>>,
      update: createMockFn(async () => ({})) as MockFn<(...args: never[]) => Promise<unknown>>,
    },
    trip: {
      update: createMockFn(async () => ({})) as MockFn<(...args: never[]) => Promise<unknown>>,
    },
  };
}

let prismaMock = createPrismaMock();

beforeEach(() => {
  prismaMock = createPrismaMock();
});

describe("CostService", () => {
  it("sums own + child cost/duration up to the trip", async () => {
    const nodes = [
      { id: "root", parentId: null, costAmount: 0, durationMinutes: 0, depth: 0 },
      { id: "a", parentId: "root", costAmount: 3, durationMinutes: 10, depth: 1 },
      { id: "a1", parentId: "a", costAmount: 10, durationMinutes: 5, depth: 2 },
      { id: "a2", parentId: "a", costAmount: 5, durationMinutes: 2, depth: 2 },
    ];
    prismaMock.pipelineNode.findMany = createMockFn(async () => nodes);
    const updates: Array<{ id: string; costAmount: number; durationMinutes: number }> = [];
    prismaMock.pipelineNode.update = createMockFn(async (args: { where: { id: string }; data: { costAmount: number; durationMinutes: number } }) => {
      updates.push({ id: args.where.id, costAmount: args.data.costAmount, durationMinutes: args.data.durationMinutes });
      return {};
    }) as never;
    prismaMock.trip.update = createMockFn(async () => ({}));

    const result = await new CostService(prismaMock as never).rollupTrip("trip-1");

    const byId = Object.fromEntries(updates.map((row) => [row.id, row]));
    assert.equal(byId.a?.costAmount, 18);
    assert.equal(byId.a?.durationMinutes, 17);
    assert.equal(byId.root?.costAmount, 18);
    assert.equal(byId.root?.durationMinutes, 17);
    assert.equal(result.totalCostAmount, 18);
    assert.equal(result.totalDurationMinutes, 17);
    assert.equal((prismaMock.trip.update.mock.calls[0]?.[0] as { data: { totalCostAmount: number } }).data.totalCostAmount, 18);
  });

  it("returns zeros when the trip has no nodes", async () => {
    prismaMock.pipelineNode.findMany = createMockFn(async () => []);
    const result = await new CostService(prismaMock as never).rollupTrip("empty");
    assert.deepEqual(result, { totalCostAmount: 0, totalDurationMinutes: 0 });
    assert.equal(prismaMock.trip.update.mock.calls.length, 0);
  });
});
