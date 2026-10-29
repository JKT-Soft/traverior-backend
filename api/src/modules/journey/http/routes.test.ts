import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { buildTestApp, createMockFn, injectJson, type MockFn } from "../../../test/helpers.js";
import { createJourneyModule } from "../index.js";

function createPrismaMock(): {
  user: { upsert: MockFn<(...args: never[]) => Promise<unknown>> };
  trip: {
    create: MockFn<(...args: never[]) => Promise<unknown>>;
    findMany: MockFn<(...args: never[]) => Promise<unknown>>;
    findFirst: MockFn<(...args: never[]) => Promise<unknown>>;
    update: MockFn<(...args: never[]) => Promise<unknown>>;
  };
  journey: {
    create: MockFn<(...args: never[]) => Promise<unknown>>;
    update: MockFn<(...args: never[]) => Promise<unknown>>;
  };
  stop: {
    create: MockFn<(...args: never[]) => Promise<unknown>>;
    findMany: MockFn<(...args: never[]) => Promise<unknown>>;
    findFirst: MockFn<(...args: never[]) => Promise<unknown>>;
    update: MockFn<(...args: never[]) => Promise<unknown>>;
    updateMany: MockFn<(...args: never[]) => Promise<unknown>>;
  };
  stopEditLog: {
    create: MockFn<(...args: never[]) => Promise<unknown>>;
  };
  catalogChecklist: {
    findFirst: MockFn<(...args: never[]) => Promise<unknown>>;
    create: MockFn<(...args: never[]) => Promise<unknown>>;
    update: MockFn<(...args: never[]) => Promise<unknown>>;
  };
  catalogHotel: {
    create: MockFn<(...args: never[]) => Promise<unknown>>;
  };
  booking: {
    findFirst: MockFn<(...args: never[]) => Promise<unknown>>;
    update: MockFn<(...args: never[]) => Promise<unknown>>;
  };
  $transaction: MockFn<(fn: (tx: unknown) => unknown) => Promise<unknown>>;
} {
  return {
    user: {
      upsert: createMockFn(async () => ({ id: "user-1", firebaseUid: "fb" })),
    },
    trip: {
      create: createMockFn(async () => ({})),
      findMany: createMockFn(async () => []),
      findFirst: createMockFn(async () => null),
      update: createMockFn(async () => ({})),
    },
    journey: {
      create: createMockFn(async () => ({ id: "journey-1", name: "T", stops: [] })),
      update: createMockFn(async () => ({})),
    },
    stop: {
      create: createMockFn(async () => ({ id: "n1", name: "Note", kind: "activity", isLocked: false, isCustom: false })),
      findMany: createMockFn(async () => []),
      findFirst: createMockFn(async () => null),
      update: createMockFn(async () => ({ id: "n1", name: "Note", kind: "activity", isLocked: false, isCustom: false })),
      updateMany: createMockFn(async () => ({ count: 1 })),
    },
    stopEditLog: {
      create: createMockFn(async () => ({ id: "log-1" })),
    },
    catalogChecklist: {
      findFirst: createMockFn(async () => null),
      create: createMockFn(async () => ({})),
      update: createMockFn(async () => ({})),
    },
    catalogHotel: {
      create: createMockFn(async () => ({ id: "hotel-cat-1" })),
    },
    booking: {
      findFirst: createMockFn(async () => null),
      update: createMockFn(async () => ({})),
    },
    $transaction: createMockFn(async (fn: (tx: unknown) => unknown) => fn({})),
  };
}

let prismaMock = createPrismaMock();

beforeEach(() => {
  prismaMock = createPrismaMock();
});

describe("journey http routes", () => {
  it("lists, creates, gets trip and nodes", async () => {
    prismaMock.user.upsert = createMockFn(async () => ({ id: "user-1", firebaseUid: "demo" }));
    prismaMock.trip.findMany = createMockFn(async () => []);
    prismaMock.$transaction = createMockFn(async (fn: (tx: unknown) => unknown) =>
      fn({
        trip: {
          create: createMockFn(async () => ({
            id: "t1",
            userId: "user-1",
            title: "T",
            baseCurrency: "IDR",
          })),
        },
        journey: { create: createMockFn(async () => ({ id: "r1", name: "T", stops: [] })) },
      }),
    );
    const parentId = "00000000-0000-0000-0000-000000000001";
    prismaMock.trip.findFirst = createMockFn(async () => ({
      id: "t1",
      userId: "user-1",
      title: "T",
      status: "draft",
      baseCurrency: "IDR",
      journey: {
        id: parentId,
        name: "T",
        stops: [],
      },
    }));
    prismaMock.stop.findMany = createMockFn(async () => []);
    prismaMock.stop.create = createMockFn(async () => ({ id: "n1", name: "Note", kind: "activity" }));

    const { routes } = createJourneyModule({ db: prismaMock as never });

    const unauth = await buildTestApp(routes);
    const denied = await injectJson(unauth, "GET", "/");
    assert.equal(denied.statusCode, 401);
    await unauth.close();

    const app = await buildTestApp(routes, { user: { uid: "demo" } });

    await injectJson(app, "GET", "/");

    const badCreate = await injectJson(app, "POST", "/", { body: {} });
    assert.equal(badCreate.statusCode, 400);

    await injectJson(app, "POST", "/", { body: { title: "Trip" } });
    const getTrip = await injectJson(app, "GET", "/t1");
    assert.equal(getTrip.statusCode, 200);
    assert.equal(getTrip.json().data.meta.schema, "trip+journey.stops+catalog");
    assert.equal(getTrip.json().data.trip.name, "T");
    assert.ok(Array.isArray(getTrip.json().data.journey.stops));
    assert.equal(getTrip.json().data.trip.nodes, undefined);
    await injectJson(app, "GET", `/t1/nodes?parentId=${parentId}`);
    await injectJson(app, "GET", "/t1/nodes");

    const badNode = await injectJson(app, "POST", "/t1/nodes", { body: {} });
    assert.equal(badNode.statusCode, 400);

    await injectJson(app, "POST", "/t1/nodes", {
      body: {
        parentId,
        type: "LEAF",
        title: "Note",
        content: { x: 1 },
      },
    });

    await app.close();
  });

  it("loads planning chat state", async () => {
    prismaMock.user.upsert = createMockFn(async () => ({ id: "user-1", firebaseUid: "demo" }));
    prismaMock.trip.findFirst = createMockFn(async () => ({
      id: "t1",
      destinationSummary: "Tokyo",
    }));
    (prismaMock as { planningDraft?: { findUnique: MockFn<(...args: never[]) => Promise<unknown>> } }).planningDraft = {
      findUnique: createMockFn(async () => null),
    };
    (prismaMock as { planningMessage?: { findMany: MockFn<(...args: never[]) => Promise<unknown>> } }).planningMessage = {
      findMany: createMockFn(async () => []),
    };

    const { routes } = createJourneyModule({ db: prismaMock as never });
    const app = await buildTestApp(routes, { user: { uid: "demo" } });
    const res = await injectJson(app, "GET", "/t1/planning");
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().data.tripId, "t1");
    assert.equal(res.json().data.phase, "collecting");
    assert.equal(res.json().data.canSearch, false);
    assert.deepEqual(res.json().data.messages, []);
    await app.close();
  });

  it("updates, locks, unlocks, reorders, and deletes nodes", async () => {
    prismaMock.user.upsert = createMockFn(async () => ({ id: "user-1", firebaseUid: "demo" }));
    const nodeId = "00000000-0000-0000-0000-000000000002";
    const journeyId = "00000000-0000-0000-0000-000000000001";
    const existingStop = {
      id: nodeId,
      journeyId,
      parentStopId: null,
      kind: "stay",
      name: "Tokyo Hotel",
      subtitle: "3 days",
      status: "planned",
      sortOrder: 0,
      path: "journey/stay_tokyo",
      isLocked: false,
      isCustom: false,
      deletedAt: null,
    };
    prismaMock.trip.findFirst = createMockFn(async () => ({
      id: "t1",
      userId: "user-1",
      title: "Tokyo Trip",
      journey: {
        id: journeyId,
        stops: [existingStop],
      },
    }));
    prismaMock.stop.findFirst = createMockFn(async () => existingStop);
    prismaMock.stop.update = createMockFn(async (args: { data: Record<string, unknown> }) => ({
      ...existingStop,
      ...args.data,
      isLocked: args.data.isLocked ?? existingStop.isLocked,
      name: args.data.name ?? existingStop.name,
    }));
    prismaMock.stop.findMany = createMockFn(async () => [existingStop]);

    const { routes } = createJourneyModule({ db: prismaMock as never });
    const app = await buildTestApp(routes, { user: { uid: "demo" } });

    // 1. PATCH node
    const patchRes = await injectJson(app, "PATCH", `/t1/nodes/${nodeId}`, {
      body: { title: "Imperial Hotel Tokyo", isLocked: true },
    });
    assert.equal(patchRes.statusCode, 200);
    assert.equal(patchRes.json().data.node.title, "Imperial Hotel Tokyo");
    assert.equal(patchRes.json().data.node.isLocked, true);

    // 2. Lock node endpoint
    const lockRes = await injectJson(app, "POST", `/t1/nodes/${nodeId}/lock`);
    assert.equal(lockRes.statusCode, 200);
    assert.equal(lockRes.json().data.node.isLocked, true);

    // 3. Unlock node endpoint
    const unlockRes = await injectJson(app, "POST", `/t1/nodes/${nodeId}/unlock`);
    assert.equal(unlockRes.statusCode, 200);
    assert.equal(unlockRes.json().data.node.isLocked, false);

    // 4. Reorder nodes
    const reorderRes = await injectJson(app, "PATCH", "/t1/nodes/reorder", {
      body: { nodeIds: [nodeId] },
    });
    assert.equal(reorderRes.statusCode, 200);
    assert.equal(reorderRes.json().data.success, true);

    // 5. Delete node
    const deleteRes = await injectJson(app, "DELETE", `/t1/nodes/${nodeId}`);
    assert.equal(deleteRes.statusCode, 200);
    assert.equal(deleteRes.json().data.success, true);
    assert.equal(deleteRes.json().data.id, nodeId);

    await app.close();
  });

  it("adds and updates checklist items via HTTP", async () => {
    prismaMock.user.upsert = createMockFn(async () => ({ id: "user-1", firebaseUid: "demo" }));
    const tripId = "00000000-0000-0000-0000-000000000001";
    const checklistId = "00000000-0000-0000-0000-000000000002";
    prismaMock.trip.findFirst = createMockFn(async () => ({ id: tripId, userId: "user-1" }));
    prismaMock.catalogChecklist.findFirst = createMockFn(async () => ({
      id: checklistId,
      tripId,
      title: "Trip checklist",
      provider: "user",
      items: [
        { id: "item-1", label: "Existing item", done: false, source: "template" },
      ],
      updatedAt: new Date("2026-10-14T00:00:00.000Z"),
    }));
    prismaMock.catalogChecklist.update = createMockFn(async (args: { data: { items: unknown } }) => ({
      id: checklistId,
      tripId,
      title: "Trip checklist",
      provider: "user",
      items: args.data.items,
      updatedAt: new Date("2026-10-14T01:00:00.000Z"),
    }));

    const { routes } = createJourneyModule({ db: prismaMock as never });
    const app = await buildTestApp(routes, { user: { uid: "demo" } });

    // 1. Add checklist item (POST)
    const addRes = await injectJson(app, "POST", `/${tripId}/checklists/${checklistId}/items`, {
      body: { title: "Bring camera", category: "Essentials" },
    });
    assert.equal(addRes.statusCode, 201);
    assert.equal(addRes.json().data.checklist.items.length, 2);
    assert.equal(addRes.json().data.checklist.items[1].label, "Bring camera");
    assert.equal(addRes.json().data.checklist.items[1].category, "Essentials");

    // 2. Update checklist item (PATCH)
    const patchRes = await injectJson(app, "PATCH", `/${tripId}/checklists/${checklistId}/items/item-1`, {
      body: { done: true },
    });
    assert.equal(patchRes.statusCode, 200);

    // 3. Create a custom checklist
    prismaMock.catalogChecklist.create = createMockFn(async (args: { data: { title: string; items: unknown } }) => ({
      id: "00000000-0000-0000-0000-000000000099",
      tripId,
      title: args.data.title,
      provider: "user",
      items: args.data.items,
      updatedAt: new Date("2026-10-14T02:00:00.000Z"),
    }));
    const createRes = await injectJson(app, "POST", `/${tripId}/checklists`, {
      body: { title: "My packing list", itemTitle: "Power bank", category: "Essentials" },
    });
    assert.equal(createRes.statusCode, 201);
    assert.equal(createRes.json().data.checklist.title, "My packing list");
    assert.equal(createRes.json().data.checklist.items[0].label, "Power bank");

    await app.close();
  });

  it("replaces a stay booking with a live hotel offer", async () => {
    prismaMock.user.upsert = createMockFn(async () => ({ id: "user-1", firebaseUid: "demo" }));
    const tripId = "00000000-0000-0000-0000-000000000001";
    const bookingId = "00000000-0000-0000-0000-000000000003";
    prismaMock.trip.findFirst = createMockFn(async () => ({
      id: tripId,
      userId: "user-1",
      title: "Osaka",
      baseCurrency: "IDR",
      journey: { id: "j1", stops: [] },
    }));
    prismaMock.booking.findFirst = createMockFn(async () => ({
      id: bookingId,
      kind: "hotel",
      stopId: "stop-1",
      costAmount: 100,
      costCurrency: "IDR",
      deepLinkUrl: null,
    }));
    prismaMock.catalogHotel.create = createMockFn(async () => ({ id: "cat-hotel-2" }));
    prismaMock.booking.update = createMockFn(async () => ({
      id: bookingId,
      kind: "hotel",
      role: "selected",
      deepLinkUrl: "https://example.com/hotel",
      costAmount: 250,
      costCurrency: "IDR",
    }));

    const { routes } = createJourneyModule({ db: prismaMock as never });
    const app = await buildTestApp(routes, { user: { uid: "demo" } });
    const res = await injectJson(app, "POST", `/${tripId}/bookings/${bookingId}/replace`, {
      body: {
        kind: "hotel",
        offer: {
          hotelId: "h2",
          name: "Osaka Riverside",
          checkIn: "2026-10-01",
          checkOut: "2026-10-03",
          price: { amount: 250, currency: "IDR" },
          deepLinkUrl: "https://example.com/hotel",
        },
      },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().data.booking.id, bookingId);
    assert.equal(res.json().data.booking.role, "selected");
    await app.close();
  });
});


