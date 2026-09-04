import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDaysIso,
  allocateCheckpointWindows,
  hotelCheckOutIso,
  inclusiveDayCount,
} from "./checkpoint-schedule.js";

describe("allocateCheckpointWindows", () => {
  it("splits a 4-day trip across two cities as 2+2 contiguous days", () => {
    const windows = allocateCheckpointWindows(
      [{ days: 3 }, { days: 3 }],
      { start: "2026-10-01", end: "2026-10-04" },
    );
    assert.deepEqual(windows, [
      { start: "2026-10-01", end: "2026-10-02", days: 2 },
      { start: "2026-10-03", end: "2026-10-04", days: 2 },
    ]);
  });

  it("gives three cities 2+1+1 on a 4-day trip", () => {
    const windows = allocateCheckpointWindows(
      [{ days: 2 }, { days: 2 }, { days: 2 }],
      { start: "2026-10-01", end: "2026-10-04" },
    );
    assert.deepEqual(windows, [
      { start: "2026-10-01", end: "2026-10-02", days: 2 },
      { start: "2026-10-03", end: "2026-10-03", days: 1 },
      { start: "2026-10-04", end: "2026-10-04", days: 1 },
    ]);
  });

  it("keeps a single city on the full trip range", () => {
    const windows = allocateCheckpointWindows(
      [{ days: 5 }],
      { start: "2026-11-01", end: "2026-11-04" },
    );
    assert.deepEqual(windows, [{ start: "2026-11-01", end: "2026-11-04", days: 4 }]);
  });

  it("infers end date from checkpoint days when trip end is missing", () => {
    const windows = allocateCheckpointWindows([{ days: 2 }, { days: 1 }], { start: "2026-05-01" });
    assert.deepEqual(windows, [
      { start: "2026-05-01", end: "2026-05-02", days: 2 },
      { start: "2026-05-03", end: "2026-05-03", days: 1 },
    ]);
  });

  it("returns null windows when start date is unknown", () => {
    const windows = allocateCheckpointWindows([{ days: 2 }], {});
    assert.deepEqual(windows, [null]);
  });
});

describe("date helpers", () => {
  it("counts inclusive days and hotel checkout", () => {
    assert.equal(inclusiveDayCount("2026-10-01", "2026-10-04"), 4);
    assert.equal(addDaysIso("2026-10-31", 1), "2026-11-01");
    assert.equal(hotelCheckOutIso({ start: "2026-10-01", end: "2026-10-02" }), "2026-10-03");
  });
});
