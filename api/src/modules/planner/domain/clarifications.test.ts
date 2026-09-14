import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvePlanDates } from "./clarifications.js";

describe("resolvePlanDates", () => {
  it("keeps flexible trips undated when no concrete dates exist", () => {
    const dates = resolvePlanDates({
      prompt: "Liburan ke Osaka",
      preferences: { dateFlexibility: "flexible" },
      assumedStartDate: "2026-10-01",
    });
    assert.equal(dates.mode, "flexible");
    assert.equal(dates.start, undefined);
  });

  it("keeps concrete dates even when flexibility is flexible", () => {
    const dates = resolvePlanDates({
      prompt: "Liburan ke Osaka",
      preferences: {
        dateFlexibility: "flexible",
        startDate: "2026-11-01",
        endDate: "2026-11-08",
      },
    });
    assert.equal(dates.mode, "flexible");
    assert.equal(dates.start, "2026-11-01");
    assert.equal(dates.end, "2026-11-08");
  });

  it("prefers request dates over assumed skeleton dates", () => {
    const dates = resolvePlanDates({
      prompt: "Liburan ke Osaka",
      preferences: { startDate: "2026-11-01", endDate: "2026-11-08" },
      assumedStartDate: "2026-10-01",
      assumedEndDate: "2026-10-10",
    });
    assert.equal(dates.mode, "exact");
    assert.equal(dates.start, "2026-11-01");
    assert.equal(dates.end, "2026-11-08");
  });
});
