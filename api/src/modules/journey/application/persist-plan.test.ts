import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPlanNodeDrafts, parentPathOf } from "./persist-plan.js";

describe("persist-plan", () => {
  it("parentPathOf strips last segment", () => {
    assert.equal(parentPathOf("trip/osaka"), "trip");
    assert.equal(parentPathOf("trip/osaka/hotels-1"), "trip/osaka");
  });

  it("builds checkpoint + tool child drafts with default origin hub", () => {
    const drafts = buildPlanNodeDrafts(
      {
        title: "Japan",
        checkpoints: [
          {
            city: "Osaka",
            countryCode: "JP",
            role: "STAY",
            days: 2,
            needs: ["hotels"],
          },
        ],
      },
      {
        checkpoints: [
          {
            checkpoint: {
              city: "Osaka",
              role: "STAY",
              days: 2,
              needs: ["hotels"],
            },
            results: [
              {
                ok: true,
                tool: "search_hotels",
                data: {
                  provider: "mock",
                  hotels: [
                    {
                      hotelId: "h1",
                      name: "Hotel A",
                      price: { amount: 100, currency: "USD" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    );

    assert.equal(drafts[0]?.type, "CHECKPOINT");
    assert.equal(drafts[0]?.checkpointKind, "ORIGIN");
    assert.equal(drafts[0]?.title, "Jakarta");
    assert.equal(drafts[1]?.type, "LEG");
    assert.equal(drafts[2]?.type, "CHECKPOINT");
    assert.equal(drafts[2]?.path, "trip/osaka");
    assert.equal(drafts[3]?.type, "BOOKING");
    assert.equal(drafts[3]?.title, "Hotel A");
    assert.equal(drafts[3]?.costAmount, 100);
    assert.ok(drafts[3]?.path.startsWith("trip/osaka/"));
    assert.equal(drafts[4]?.type, "LEG");
    assert.equal(drafts[5]?.checkpointKind, "RETURN");
  });

  it("builds origin, destination, and return pipeline when home city is provided", () => {
    const drafts = buildPlanNodeDrafts(
      {
        title: "Japan",
        originCity: "Jakarta",
        checkpoints: [
          {
            city: "Osaka",
            countryCode: "JP",
            role: "STAY",
            days: 2,
            needs: ["hotels"],
          },
        ],
      },
      {
        checkpoints: [
          {
            checkpoint: {
              city: "Osaka",
              role: "STAY",
              days: 2,
              needs: ["hotels"],
            },
            results: [
              {
                ok: true,
                tool: "search_hotels",
                data: {
                  provider: "mock",
                  hotels: [
                    {
                      hotelId: "h1",
                      name: "Hotel A",
                      price: { amount: 100, currency: "USD" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      { originCity: "Jakarta", returnCity: "Jakarta" },
    );

    assert.equal(drafts[0]?.checkpointKind, "ORIGIN");
    assert.equal(drafts[1]?.type, "LEG");
    assert.equal(drafts[2]?.title, "Osaka");
    assert.equal(drafts[4]?.type, "LEG");
    assert.equal(drafts[5]?.checkpointKind, "RETURN");
    assert.match(drafts[5]?.title ?? "", /Jakarta/i);
  });
});
