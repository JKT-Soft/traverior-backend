import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyPlanAnswers,
  ensureCriticalClarifications,
  filterResolvedClarifications,
  mergeExtractedPreferences,
  parseNaturalLanguageDates,
} from "./extract-slots.js";

describe("parseNaturalLanguageDates", () => {
  it("resolves Indonesian relative dates and duration, rolling past dates forward", () => {
    const dates = parseNaturalLanguageDates(
      "Saya mau liburan ke jepang 3 hari di hari pertama bulan kedua tahun ini",
      new Date("2026-09-02T00:00:00Z"),
    );
    assert.equal(dates.startDate, "2027-02-01");
    assert.equal(dates.endDate, "2027-02-03");
  });

  it("keeps an explicit ISO date", () => {
    const dates = parseNaturalLanguageDates("ke Osaka 2026-10-12 selama 4 hari", new Date("2026-09-02T00:00:00Z"));
    assert.equal(dates.startDate, "2026-10-12");
    assert.equal(dates.endDate, "2026-10-15");
  });
});

describe("merge and filter slots", () => {
  it("fills gaps from extracted slots without overriding request answers", () => {
    const merged = mergeExtractedPreferences(
      { originCity: "Surabaya", startDate: "2026-11-01" },
      { destination: "Japan", startDate: "2026-02-01", partySize: 2 },
    );
    assert.equal(merged.originCity, "Surabaya");
    assert.equal(merged.startDate, "2026-11-01");
    assert.equal(merged.destination, "Japan");
    assert.equal(merged.partySize, 2);
  });

  it("drops clarifications that are already answered", () => {
    const missing = filterResolvedClarifications(
      [
        {
          id: "dates",
          field: "startDate",
          severity: "required",
          question: "When?",
          input: "date_range",
        },
        {
          id: "partySize",
          field: "partySize",
          severity: "recommended",
          question: "How many?",
          input: "number",
        },
      ],
      { startDate: "2026-11-01" },
    );
    assert.deepEqual(
      missing.map((item) => item.id),
      ["partySize"],
    );
  });

  it("adds critical destination/date clarifications if the LLM omitted them", () => {
    const missing = ensureCriticalClarifications([], {});
    assert.deepEqual(
      missing.map((item) => item.id),
      ["destination", "dates"],
    );
  });

  it("applies retry answers onto preferences", () => {
    const merged = applyPlanAnswers(
      { originCity: "Surabaya" },
      { destination: "Osaka", dateFlexibility: "flexible", partySize: "2" },
    );
    assert.equal(merged.destination, "Osaka");
    assert.equal(merged.dateFlexibility, "flexible");
    assert.equal(merged.partySize, 2);
  });
});
