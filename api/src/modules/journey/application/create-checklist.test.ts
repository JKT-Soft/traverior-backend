import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NotFoundError } from "../../../shared/http/errors.js";
import { createMockFn } from "../../../test/helpers.js";
import { JourneyService } from "./service.js";

describe("JourneyService.createChecklist", () => {
  it("creates a custom checklist with an optional first item", async () => {
    const createChecklist = createMockFn(async (args: { data: { title: string; items: unknown } }) => ({
      id: "chk-new",
      tripId: "trip-1",
      title: args.data.title,
      provider: "user",
      items: args.data.items,
      updatedAt: new Date("2026-10-17T00:00:00.000Z"),
    }));

    const service = new JourneyService({
      trip: { findFirst: createMockFn(async () => ({ id: "trip-1" })) },
      catalogChecklist: { create: createChecklist },
    } as never);

    const result = await service.createChecklist({
      tripId: "trip-1",
      userId: "user-1",
      title: "My packing list",
      itemTitle: "Universal adapter",
      category: "Essentials",
    });

    assert.equal(result.title, "My packing list");
    assert.equal(result.provider, "user");
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.label, "Universal adapter");
    assert.equal(result.items[0]?.source, "user");
    assert.equal(result.items[0]?.category, "Essentials");
    assert.equal(createChecklist.mock.calls.length, 1);
  });

  it("rejects an unknown trip", async () => {
    const service = new JourneyService({
      trip: { findFirst: createMockFn(async () => null) },
    } as never);

    await assert.rejects(
      () =>
        service.createChecklist({
          tripId: "missing",
          userId: "user-1",
          title: "Mine",
        }),
      NotFoundError,
    );
  });
});

describe("JourneyService.deleteChecklistItem", () => {
  it("removes a nested JSON checklist item", async () => {
    const updateChecklist = createMockFn(async (args: { data: { items: unknown } }) => ({
      id: "chk-1",
      tripId: "trip-1",
      title: "Travel checklist",
      provider: "user",
      items: args.data.items,
      updatedAt: new Date("2026-10-17T01:00:00.000Z"),
    }));

    const service = new JourneyService({
      trip: { findFirst: createMockFn(async () => ({ id: "trip-1" })) },
      catalogChecklist: {
        findFirst: createMockFn(async () => ({
          id: "chk-1",
          tripId: "trip-1",
          title: "Travel checklist",
          provider: "user",
          items: [
            { id: "keep", label: "Passport", done: false, source: "template" },
            { id: "drop", label: "Camera", done: false, source: "user" },
          ],
          updatedAt: new Date("2026-10-17T00:00:00.000Z"),
        })),
        update: updateChecklist,
      },
    } as never);

    const result = await service.deleteChecklistItem({
      tripId: "trip-1",
      userId: "user-1",
      checklistId: "chk-1",
      itemId: "drop",
    });

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.id, "keep");
  });
});
