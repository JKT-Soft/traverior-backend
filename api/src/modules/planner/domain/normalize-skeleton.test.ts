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
});
