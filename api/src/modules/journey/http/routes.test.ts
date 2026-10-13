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
});

