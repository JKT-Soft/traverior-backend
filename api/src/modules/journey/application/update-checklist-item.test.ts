import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NotFoundError } from "../../../shared/http/errors.js";
import { createMockFn } from "../../../test/helpers.js";
import { JourneyService } from "./service.js";

describe("JourneyService.updateChecklistItem", () => {
  it("marks a nested JSON checklist item as done", async () => {
    const findTrip = createMockFn(async () => ({ id: "trip-1" }));
    const findChecklist = createMockFn(async () => ({
      id: "chk-1",
      tripId: "trip-1",
      title: "Travel checklist",
      provider: "internal",
      items: [
        { id: "passport", label: "Passport", done: false, source: "template" },
        { id: "esim", label: "eSIM", done: false, source: "template" },
      ],
      updatedAt: new Date("2026-10-12T00:00:00.000Z"),
    }));
    const updateChecklist = createMockFn(async () => ({
      id: "chk-1",
      tripId: "trip-1",
      title: "Travel checklist",
      provider: "internal",
      items: [
        { id: "passport", label: "Passport", done: true, source: "template" },
        { id: "esim", label: "eSIM", done: false, source: "template" },
      ],
      updatedAt: new Date("2026-10-12T01:00:00.000Z"),
    }));

    const service = new JourneyService({
      trip: { findFirst: findTrip },
      catalogChecklist: {
        findFirst: findChecklist,
        update: updateChecklist,
      },
    } as never);

    const result = await service.updateChecklistItem({
      tripId: "trip-1",
      userId: "user-1",
      checklistId: "chk-1",
      itemId: "passport",
      done: true,
    });

    assert.equal(result.items[0]?.done, true);
    assert.equal(result.items[1]?.done, false);
    assert.equal(updateChecklist.mock.calls.length, 1);
    const updateArg = updateChecklist.mock.calls[0]?.[0] as {
      data: { items: Array<{ id: string; done: boolean }> };
    };
    assert.deepEqual(updateArg.data.items, [
      { id: "passport", label: "Passport", done: true, source: "template" },
      { id: "esim", label: "eSIM", done: false, source: "template" },
    ]);
  });

  it("rejects unknown trip, checklist, or item", async () => {
    const serviceMissingTrip = new JourneyService({
      trip: { findFirst: createMockFn(async () => null) },
      catalogChecklist: {
        findFirst: createMockFn(async () => null),
        update: createMockFn(async () => ({})),
      },
    } as never);
    await assert.rejects(
      () =>
        serviceMissingTrip.updateChecklistItem({
          tripId: "missing",
          userId: "user-1",
          checklistId: "chk-1",
          itemId: "passport",
          done: true,
        }),
      NotFoundError,
    );

    const serviceMissingChecklist = new JourneyService({
      trip: { findFirst: createMockFn(async () => ({ id: "trip-1" })) },
      catalogChecklist: {
        findFirst: createMockFn(async () => null),
        update: createMockFn(async () => ({})),
      },
    } as never);
    await assert.rejects(
      () =>
        serviceMissingChecklist.updateChecklistItem({
          tripId: "trip-1",
          userId: "user-1",
          checklistId: "missing",
          itemId: "passport",
          done: true,
        }),
      NotFoundError,
    );

    const serviceMissingItem = new JourneyService({
      trip: { findFirst: createMockFn(async () => ({ id: "trip-1" })) },
      catalogChecklist: {
        findFirst: createMockFn(async () => ({
          id: "chk-1",
          tripId: "trip-1",
          title: "Travel checklist",
          provider: "internal",
          items: [{ id: "passport", label: "Passport", done: false, source: "template" }],
          updatedAt: new Date("2026-10-12T00:00:00.000Z"),
        })),
        update: createMockFn(async () => ({})),
      },
    } as never);
    await assert.rejects(
      () =>
        serviceMissingItem.updateChecklistItem({
          tripId: "trip-1",
          userId: "user-1",
          checklistId: "chk-1",
          itemId: "missing-item",
          done: true,
        }),
      NotFoundError,
    );
  });
});
