import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NotFoundError, ValidationError } from "../../../shared/http/errors.js";
import { createMockFn } from "../../../test/helpers.js";
import { JourneyService } from "./service.js";

describe("JourneyService.addChecklistItem", () => {
  it("appends a custom checklist item with category", async () => {
    const findTrip = createMockFn(async () => ({ id: "trip-1" }));
    const findChecklist = createMockFn(async () => ({
      id: "chk-1",
      tripId: "trip-1",
      title: "Travel checklist",
      provider: "internal",
      items: [
        { id: "passport", label: "Passport", done: false, source: "template" },
      ],
      updatedAt: new Date("2026-10-12T00:00:00.000Z"),
    }));
    const updateChecklist = createMockFn(async (args: { data: { items: unknown } }) => ({
      id: "chk-1",
      tripId: "trip-1",
      title: "Travel checklist",
      provider: "internal",
      items: args.data.items,
      updatedAt: new Date("2026-10-12T01:00:00.000Z"),
    }));

    const service = new JourneyService({
      trip: { findFirst: findTrip },
      catalogChecklist: {
        findFirst: findChecklist,
        update: updateChecklist,
      },
    } as never);

    const result = await service.addChecklistItem({
      tripId: "trip-1",
      userId: "user-1",
      checklistId: "chk-1",
      title: "Bring universal plug adapter",
      category: "Essentials",
    });

    assert.equal(result.items.length, 2);
    assert.equal(result.items[1]?.label, "Bring universal plug adapter");
    assert.equal(result.items[1]?.category, "Essentials");
    assert.equal(result.items[1]?.done, false);
    assert.equal(result.items[1]?.source, "user");
    assert.equal(updateChecklist.mock.calls.length, 1);
  });

  it("creates a new checklist automatically if none exists for the trip", async () => {
    const findTrip = createMockFn(async () => ({ id: "trip-1" }));
    const findChecklist = createMockFn(async () => null);
    const createChecklist = createMockFn(async () => ({
      id: "chk-new",
      tripId: "trip-1",
      title: "Trip checklist",
      provider: "user",
      items: [],
      updatedAt: new Date("2026-10-12T00:00:00.000Z"),
    }));
    const updateChecklist = createMockFn(async (args: { data: { items: unknown } }) => ({
      id: "chk-new",
      tripId: "trip-1",
      title: "Trip checklist",
      provider: "user",
      items: args.data.items,
      updatedAt: new Date("2026-10-12T01:00:00.000Z"),
    }));

    const service = new JourneyService({
      trip: { findFirst: findTrip },
      catalogChecklist: {
        findFirst: findChecklist,
        create: createChecklist,
        update: updateChecklist,
      },
    } as never);

    const result = await service.addChecklistItem({
      tripId: "trip-1",
      userId: "user-1",
      title: "Print flight tickets",
      category: "Documents",
    });

    assert.equal(createChecklist.mock.calls.length, 1);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.label, "Print flight tickets");
    assert.equal(result.items[0]?.category, "Documents");
    assert.equal(result.items[0]?.source, "user");
  });

  it("rejects empty title or unknown trip", async () => {
    const service = new JourneyService({
      trip: { findFirst: createMockFn(async () => null) },
    } as never);

    await assert.rejects(
      () =>
        service.addChecklistItem({
          tripId: "trip-1",
          userId: "user-1",
          title: "   ",
        }),
      ValidationError,
    );

    await assert.rejects(
      () =>
        service.addChecklistItem({
          tripId: "missing",
          userId: "user-1",
          title: "Valid item",
        }),
      NotFoundError,
    );
  });
});
