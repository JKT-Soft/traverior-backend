import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPlanNodeDrafts, parentPathOf } from "./persist-plan.js";

describe("persist-plan", () => {
  it("parentPathOf strips last segment", () => {
    assert.equal(parentPathOf("trip/osaka"), "trip");
    assert.equal(parentPathOf("trip/osaka/hotels-1"), "trip/osaka");
  });

  it("builds checkpoint + tool child drafts", () => {
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
    assert.equal(drafts[0]?.path, "trip/osaka");
    assert.equal(drafts[1]?.type, "BOOKING");
    assert.equal(drafts[1]?.title, "Hotel A");
    assert.equal(drafts[1]?.costAmount, 100);
    assert.ok(drafts[1]?.path.startsWith("trip/osaka/"));
  });
});
