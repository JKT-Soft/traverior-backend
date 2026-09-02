import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergePlanPreferences } from "./merge-plan-preferences.js";

describe("mergePlanPreferences", () => {
  it("uses stored home city when request and trip omit origin", () => {
    const merged = mergePlanPreferences({
      stored: { extra: { originCity: "Surabaya", passportCountry: "ID" } },
    });
    assert.equal(merged.originCity, "Surabaya");
    assert.equal(merged.passportCountry, "ID");
  });

  it("lets request origin override stored home city (GPS or explicit)", () => {
    const merged = mergePlanPreferences({
      stored: { extra: { originCity: "Surabaya" } },
      request: { originCity: "Bandung" },
    });
    assert.equal(merged.originCity, "Bandung");
  });

  it("falls back to trip origin, then leaves origin unset", () => {
    const withTrip = mergePlanPreferences({ tripOriginCity: "Medan" });
    assert.equal(withTrip.originCity, "Medan");

    const empty = mergePlanPreferences({});
    assert.equal(empty.originCity, undefined);
  });

  it("passes date flexibility and destination through", () => {
    const merged = mergePlanPreferences({
      request: { dateFlexibility: "flexible", destination: "Osaka" },
    });
    assert.equal(merged.dateFlexibility, "flexible");
    assert.equal(merged.destination, "Osaka");
  });

  it("maps budget style and prefers request pace", () => {
    const merged = mergePlanPreferences({
      stored: { budgetStyle: "balanced", pace: "relaxed" },
      request: { pace: "packed" },
    });
    assert.equal(merged.budgetTone, "mid");
    assert.equal(merged.pace, "packed");
  });
});
