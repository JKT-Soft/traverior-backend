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
  pipelineNode: {
    create: MockFn<(...args: never[]) => Promise<unknown>>;
    findMany: MockFn<(...args: never[]) => Promise<unknown>>;
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
    pipelineNode: {
      create: createMockFn(async () => ({})),
      findMany: createMockFn(async () => []),
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
          update: createMockFn(async () => ({ id: "t1", nodes: [] })),
        },
        pipelineNode: { create: createMockFn(async () => ({ id: "r1" })) },
      }),
    );
    const parentId = "00000000-0000-0000-0000-000000000001";
    prismaMock.trip.findFirst = createMockFn(async () => ({
      id: "t1",
      userId: "user-1",
      title: "T",
      status: "draft",
      baseCurrency: "IDR",
      nodes: [
        {
          id: parentId,
          parentId: null,
          depth: 0,
          path: "trip",
          title: "T",
          type: "JOURNEY",
          sortOrder: 0,
        },
      ],
    }));
    prismaMock.pipelineNode.findMany = createMockFn(async () => []);
    prismaMock.pipelineNode.create = createMockFn(async () => ({ id: "n1" }));

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
});
