import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { NotFoundError, ValidationError } from "../../../shared/http/errors.js";
import { createMockFn, type MockFn } from "../../../test/helpers.js";
import { JourneyService } from "./service.js";

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

describe("JourneyService", () => {
  it("creates trip, lists, gets, children, addNode", async () => {
    const service = new JourneyService(prismaMock as never);
    prismaMock.user.upsert = createMockFn(async () => ({ id: "user-1", firebaseUid: "fb" }));

    prismaMock.$transaction = createMockFn(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        trip: {
          create: createMockFn(async () => ({
            id: "trip-1",
            userId: "user-1",
            title: "Japan",
            baseCurrency: "IDR",
          })),
          update: createMockFn(async () => ({
            id: "trip-1",
            rootNodeId: "root-1",
            nodes: [{ id: "root-1", parentId: null, depth: 0, path: "trip", title: "Japan" }],
          })),
        },
        pipelineNode: {
          create: createMockFn(async () => ({ id: "root-1", depth: 0, path: "trip" })),
        },
      };
      return fn(tx);
    });

    const created = await service.createTrip({
      userId: "user-1",
      title: "Japan",
      originCity: "Jakarta",
    });
    assert.equal(created.id, "trip-1");

    prismaMock.trip.findMany = createMockFn(async () => [{ id: "trip-1" }]);
    assert.equal((await service.listTrips("user-1")).length, 1);

    prismaMock.trip.findFirst = createMockFn(async () => null);
    await assert.rejects(() => service.getTrip("missing", "user-1"), NotFoundError);

    prismaMock.trip.findFirst = createMockFn(async () => ({
      id: "trip-1",
      userId: "user-1",
      baseCurrency: "IDR",
      nodes: [
        { id: "root-1", parentId: null, depth: 0, path: "trip", title: "Japan" },
        { id: "child-1", parentId: "root-1", depth: 1, path: "trip/osaka", title: "Osaka" },
      ],
    }));
    const trip = await service.getTrip("trip-1", "user-1");
    assert.equal(trip.nodes.length, 2);

    prismaMock.pipelineNode.findMany = createMockFn(async () => [{ id: "child-1" }]);
    assert.equal((await service.listChildren("trip-1", "user-1", "root-1")).length, 1);
    await service.listChildren("trip-1", "user-1", null);

    prismaMock.pipelineNode.create = createMockFn(async () => ({ id: "n2", title: "Hotel" }));
    const node = await service.addNode({
      tripId: "trip-1",
      userId: "user-1",
      parentId: "root-1",
      type: "BOOKING",
      title: "Hotel!!!",
      contentType: "hotel",
      content: { a: 1 },
      costAmount: 10,
      durationMinutes: 5,
      deepLinkUrl: "https://x.com",
      provider: "mock",
      providerRef: "r1",
    });
    assert.equal(node.id, "n2");

    await assert.rejects(
      () =>
        service.addNode({
          tripId: "trip-1",
          userId: "user-1",
          parentId: "missing",
          type: "LEAF",
          title: "x",
        }),
      ValidationError,
    );

    prismaMock.pipelineNode.create = createMockFn(async () => ({ id: "n3" }));
    await service.addNode({
      tripId: "trip-1",
      userId: "user-1",
      parentId: "root-1",
      type: "LEAF",
      title: "***",
    });
  });

  it("createTrip optional fields + ensureUser", async () => {
    const upsert = createMockFn(async () => ({ id: "u1" }));
    const service = new JourneyService({
      user: { upsert },
      trip: {
        findMany: async () => [],
        findFirst: async () => null,
        update: async () => ({}),
        create: async () => ({}),
      },
      pipelineNode: {
        create: async () => ({}),
        findMany: async () => [],
        update: async () => ({}),
      },
      $transaction: async (fn: (tx: never) => unknown) =>
        fn({
          trip: {
            create: async () => ({ id: "t1", userId: "u1", title: "T", baseCurrency: "IDR" }),
            update: async () => ({ id: "t1", nodes: [] }),
          },
          pipelineNode: { create: async () => ({ id: "r1" }) },
        } as never),
    } as never);

    await service.ensureUser("fb", "a@b.c");
    assert.equal(upsert.mock.calls.length, 1);
    await service.createTrip({
      userId: "u1",
      title: "Trip",
      startDate: "2026-10-01",
      endDate: "2026-10-10",
      partySize: 3,
      destinationSummary: "Osaka",
    });
  });
});
