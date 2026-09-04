import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { moneyToNumber, serializeTrip, serializeTripNode } from "./serialize-trip.js";

describe("moneyToNumber", () => {
  it("parses numbers, numeric strings, and amount maps", () => {
    assert.equal(moneyToNumber(1200000), 1200000);
    assert.equal(moneyToNumber("1200000.00"), 1200000);
    assert.equal(moneyToNumber({ amount: "50" }), 50);
    assert.equal(moneyToNumber(null), 0);
  });

  it("parses Prisma/decimal.js JSON leftovers", () => {
    assert.equal(moneyToNumber({ s: 1, e: 6, d: [1200000] }), 1200000);
    assert.equal(moneyToNumber({ s: 1, e: 1, d: [125] }), 12.5);
    assert.equal(
      moneyToNumber({
        toNumber: () => 99,
      }),
      99,
    );
  });
});

describe("serializeTrip", () => {
  it("converts trip and node money fields to numbers", () => {
    const trip = serializeTrip({
      id: "t1",
      totalCostAmount: { s: 1, e: 6, d: [1200000] },
      nodes: [{ id: "n1", costAmount: "450000" }],
    });
    assert.equal(trip.totalCostAmount, 1200000);
    assert.equal(trip.nodes?.[0]?.costAmount, 450000);
    assert.equal(serializeTripNode({ costAmount: {} }).costAmount, 0);
  });
});
