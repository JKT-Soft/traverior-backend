import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createMockFn, type MockFn } from "../../test/helpers.js";
import { CostService } from "./service.js";

function createPrismaMock() {
  return {
    stop: {
      findMany: createMockFn(async () => []) as MockFn<(...args: never[]) => Promise<unknown>>,
    },
    trip: {
      findUnique: createMockFn(async () => ({ baseCurrency: "IDR" })) as MockFn<(...args: never[]) => Promise<unknown>>,
      update: createMockFn(async () => ({})) as MockFn<(...args: never[]) => Promise<unknown>>,
    },
    budget: {
      deleteMany: createMockFn(async () => ({ count: 0 })) as MockFn<(...args: never[]) => Promise<unknown>>,
      create: createMockFn(async () => ({})) as MockFn<(...args: never[]) => Promise<unknown>>,
    },
  };
}

let prismaMock = createPrismaMock();

beforeEach(() => {
  prismaMock = createPrismaMock();
});

describe("CostService", () => {
  it("rolls booking cost and nested duration up to the trip", async () => {
    const stops = [
      {
        id: "root",
        parentStopId: null,
        depth: 0,
        days: 0,
        bookings: [{ kind: "hotel", costAmount: 3, flight: null }],
      },
      {
        id: "a",
        parentStopId: "root",
        depth: 1,
        days: 0,
        bookings: [{ kind: "flight", costAmount: 10, flight: { durationMinutes: 5 } }],
      },
      {
        id: "b",
        parentStopId: "root",
        depth: 1,
        days: 0,
        bookings: [{ kind: "event", costAmount: 5, flight: { durationMinutes: 2 } }],
      },
    ];
    prismaMock.stop.findMany = createMockFn(async () => stops);
    const budgets: Array<{ id?: string; amount: number }> = [];
    prismaMock.budget.create = createMockFn(async (args: { data: { stopId?: string; tripId?: string; amount: number } }) => {
      budgets.push({ id: args.data.stopId ?? args.data.tripId, amount: args.data.amount });
      return {};
    }) as never;

    const result = await new CostService(prismaMock as never).rollupTrip("trip-1");

    const byId = Object.fromEntries(budgets.map((row) => [row.id, row]));
    assert.equal(byId.a?.amount, 10);
    assert.equal(byId.b?.amount, 5);
    assert.equal(byId.root?.amount, 18);
    assert.equal(byId["trip-1"]?.amount, 18);
    assert.equal(result.totalCostAmount, 18);
    assert.equal(result.totalDurationMinutes, 7);
    assert.equal(
      (prismaMock.trip.update.mock.calls[0]?.[0] as { data: { totalCostAmount: number } }).data.totalCostAmount,
      18,
    );
  });

  it("returns zeros when the trip has no stops", async () => {
    prismaMock.stop.findMany = createMockFn(async () => []);
    const result = await new CostService(prismaMock as never).rollupTrip("empty");
    assert.deepEqual(result, { totalCostAmount: 0, totalDurationMinutes: 0 });
    assert.equal(prismaMock.trip.update.mock.calls.length, 0);
  });
});
