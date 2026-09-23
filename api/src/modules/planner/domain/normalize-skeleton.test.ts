import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_ORIGIN_CITY, normalizeTripSkeleton } from "./normalize-skeleton.js";

describe("normalizeTripSkeleton", () => {
  it("defaults origin to Jakarta when missing", () => {
    const normalized = normalizeTripSkeleton({
      title: "Japan",
      checkpoints: [
        { city: "Tokyo", role: "STAY", days: 3, needs: ["hotels"] },
        { city: "Osaka", role: "STAY", days: 2, needs: ["hotels"] },
      ],
    });

    assert.equal(normalized.originCity, DEFAULT_ORIGIN_CITY);
    assert.equal(normalized.checkpoints.length, 2);
    assert.ok(normalized.checkpoints[0]!.needs.includes("flights"));
    assert.ok(normalized.checkpoints[1]!.needs.includes("flights"));
  });

  it("strips duplicate home city checkpoints from destinations", () => {
    const normalized = normalizeTripSkeleton(
      {
        title: "Japan",
        originCity: "Jakarta",
        checkpoints: [
          { city: "Jakarta", role: "STAY", days: 1, needs: [] },
          { city: "Tokyo", role: "STAY", days: 3, needs: ["hotels"] },
          { city: "Jakarta", role: "STAY", days: 1, needs: [] },
        ],
      },
      { tripOriginCity: "Jakarta" },
    );

    assert.deepEqual(
      normalized.checkpoints.map((c) => c.city),
      ["Tokyo"],
    );
  });

  it("keeps prompt origin over saved preference", () => {
    const normalized = normalizeTripSkeleton(
      {
        title: "Japan",
        originCity: "Bandung",
        checkpoints: [{ city: "Tokyo", role: "STAY", days: 4, needs: ["hotels"] }],
      },
      { preferences: { originCity: "Surabaya" } },
    );
    assert.equal(normalized.originCity, "Bandung");
  });

  it("respects explicit preferences origin", () => {
    const normalized = normalizeTripSkeleton(
      {
        title: "Korea",
        checkpoints: [{ city: "Seoul", role: "STAY", days: 4, needs: ["hotels"] }],
      },
      { preferences: { originCity: "Surabaya" } },
    );

    assert.equal(normalized.originCity, "Surabaya");
  });

  it("adds flights on a middle stop when countryCode changes", () => {
    const normalized = normalizeTripSkeleton({
      title: "SEA",
      originCity: "Jakarta",
      checkpoints: [
        { city: "Singapore", countryCode: "SG", role: "STAY", days: 2, needs: ["hotels"] },
        { city: "Tokyo", countryCode: "JP", role: "STAY", days: 3, needs: ["hotels"] },
        { city: "Seoul", countryCode: "KR", role: "STAY", days: 2, needs: ["hotels"] },
      ],
    });

    assert.ok(normalized.checkpoints[0]!.needs.includes("flights"));
    assert.ok(normalized.checkpoints[1]!.needs.includes("flights"));
    assert.ok(normalized.checkpoints[2]!.needs.includes("flights"));
  });

  it("does not invent middle flights for same-country land belt", () => {
    const normalized = normalizeTripSkeleton({
      title: "Japan",
      originCity: "Jakarta",
      checkpoints: [
        { city: "Tokyo", countryCode: "JP", role: "STAY", days: 3, needs: ["hotels"] },
        { city: "Kyoto", countryCode: "JP", role: "STAY", days: 2, needs: ["hotels"] },
        { city: "Osaka", countryCode: "JP", role: "STAY", days: 2, needs: ["hotels"] },
      ],
    });

    assert.ok(normalized.checkpoints[0]!.needs.includes("flights"));
    assert.equal(normalized.checkpoints[1]!.needs.includes("flights"), false);
    assert.ok(normalized.checkpoints[2]!.needs.includes("flights"));
  });

  it("resolves common city airport codes when the LLM omits them", () => {
    const normalized = normalizeTripSkeleton({
      title: "Japan",
      originCity: "Jakarta",
      checkpoints: [
        { city: "Tokyo", countryCode: "JP", role: "STAY", days: 3, needs: ["flights"] },
        { city: "Kyoto", countryCode: "JP", role: "STAY", days: 2, needs: ["flights"] },
      ],
    });

    assert.equal(normalized.originIata, "CGK");
    assert.equal(normalized.checkpoints[0]?.airportIata, "NRT");
    assert.equal(normalized.checkpoints[1]?.airportIata, "KIX");
  });
});
