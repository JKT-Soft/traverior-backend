import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildToolCallsForNeed, buildToolPlan } from "./need-tools.js";

describe("need-tools", () => {
  it("builds hotel and places calls", () => {
    const calls = buildToolCallsForNeed(
      "hotels",
      { city: "Osaka", role: "STAY", days: 3, needs: ["hotels"] },
      { checkIn: "2026-10-01", checkOut: "2026-10-04" },
    );
    assert.equal(calls[0]?.tool, "search_hotels");
    assert.equal(calls[0]?.arguments.cityName, "Osaka");
  });

  it("skips flights when context incomplete", () => {
    const calls = buildToolCallsForNeed(
      "flights",
      { city: "Tokyo", role: "STAY", days: 2, needs: ["flights"] },
      {},
    );
    assert.equal(calls.length, 0);
  });

  it("builds full plan per checkpoint", () => {
    const plan = buildToolPlan(
      {
        title: "JP",
        checkpoints: [
          {
            city: "Osaka",
            countryCode: "JP",
            role: "STAY",
            days: 2,
            needs: ["hotels", "places"],
          },
        ],
      },
      { checkIn: "2026-10-01", checkOut: "2026-10-03" },
    );
    assert.equal(plan.length, 1);
    assert.ok(plan[0]!.calls.length >= 2);
  });

  it("uses each city's stay window for hotel search", () => {
    const plan = buildToolPlan(
      {
        title: "Europe",
        checkpoints: [
          { city: "London", countryCode: "GB", role: "STAY", days: 2, needs: ["hotels"] },
          { city: "Barcelona", countryCode: "ES", role: "STAY", days: 2, needs: ["hotels"] },
        ],
      },
      { checkIn: "2026-10-01", checkOut: "2026-10-04" },
    );

    assert.equal(plan[0]?.calls[0]?.arguments.checkIn, "2026-10-01");
    assert.equal(plan[0]?.calls[0]?.arguments.checkOut, "2026-10-03");
    assert.equal(plan[1]?.calls[0]?.arguments.checkIn, "2026-10-03");
    assert.equal(plan[1]?.calls[0]?.arguments.checkOut, "2026-10-05");
  });
});
