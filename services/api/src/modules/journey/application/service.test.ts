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

  it("caches list/get and invalidates on write", async () => {
    const { MemoryCacheStore } = await import("../../../shared/cache/index.js");
    let listCalls = 0;
    let getCalls = 0;
    const tripRow = {
      id: "trip-1",
      userId: "user-1",
      baseCurrency: "IDR",
      nodes: [{ id: "root-1", parentId: null, depth: 0, path: "trip", title: "Japan" }],
    };
    const db = {
      user: { upsert: async () => ({ id: "user-1" }) },
      trip: {
        findMany: async () => {
          listCalls += 1;
          return [{ id: "trip-1" }];
        },
        findFirst: async () => {
          getCalls += 1;
          return tripRow;
        },
        create: async () => ({}),
        update: async () => ({}),
      },
      pipelineNode: {
        create: async () => ({ id: "n2", title: "Hotel" }),
        findMany: async () => [],
        update: async () => ({}),
      },
      $transaction: async (fn: (tx: never) => unknown) =>
        fn({
          trip: {
            create: async () => ({
              id: "trip-2",
              userId: "user-1",
              title: "New",
              baseCurrency: "IDR",
            }),
            update: async () => ({
              id: "trip-2",
              nodes: [{ id: "root-2", parentId: null, depth: 0, path: "trip", title: "New" }],
            }),
          },
          pipelineNode: { create: async () => ({ id: "root-2" }) },
        } as never),
    };

    const service = new JourneyService(db as never, {
      cache: new MemoryCacheStore(),
      ttlSeconds: 60,
    });

    await service.listTrips("user-1");
    await service.listTrips("user-1");
    assert.equal(listCalls, 1);

    await service.getTrip("trip-1", "user-1");
    await service.getTrip("trip-1", "user-1");
    assert.equal(getCalls, 1);

    await service.addNode({
      tripId: "trip-1",
      userId: "user-1",
      parentId: "root-1",
      type: "LEAF",
      title: "Cafe",
    });
    await service.getTrip("trip-1", "user-1");
    assert.equal(getCalls, 2);

    await service.createTrip({ userId: "user-1", title: "Another" });
    await service.listTrips("user-1");
    assert.equal(listCalls, 2);
  });

  it("planTrip persists AI nodes and rolls up cost", async () => {
    const created: Array<{ type: string; title: string; path: string }> = [];
    const tripRow = {
      id: "trip-1",
      userId: "user-1",
      title: "Draft",
      status: "draft",
      partySize: 1,
      baseCurrency: "IDR",
      originCity: null,
      destinationSummary: null,
      startDate: null,
      endDate: null,
      nodes: [{ id: "root-1", parentId: null, depth: 0, path: "trip", title: "Draft" }],
    };

    const db = {
      user: { upsert: async () => ({ id: "user-1" }) },
      trip: {
        findMany: async () => [],
        findFirst: async () => tripRow,
        create: async () => ({}),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(tripRow, data);
          return tripRow;
        },
      },
      pipelineNode: {
        findMany: async () => [
          {
            id: "root-1",
            parentId: null,
            type: "JOURNEY",
            origin: "user",
            isLocked: false,
            isCustom: false,
            suppressAiRestore: false,
            deletedAt: null,
          },
        ],
        create: async ({ data }: { data: { type: string; title: string; path: string; id?: string } }) => {
          const row = { id: `n-${created.length + 1}`, ...data };
          created.push({ type: data.type, title: data.title, path: data.path });
          return row;
        },
        update: async () => ({}),
      },
      $transaction: async (fn: (tx: never) => unknown) => fn({} as never),
    };

    const planner = {
      mcpName: "inprocess",
      planSkeleton: async () => ({
        llm: "heuristic",
        skeleton: {
          title: "Japan Adventure",
          originCity: "Jakarta",
          destinationSummary: "Osaka",
          assumedStartDate: "2026-10-01",
          assumedEndDate: "2026-10-04",
          checkpoints: [
            {
              city: "Osaka",
              countryCode: "JP",
              role: "STAY" as const,
              days: 3,
              needs: ["hotels" as const],
            },
          ],
        },
      }),
      executeSkeletonNeeds: async () => ({
        mcp: "inprocess",
        checkpoints: [
          {
            checkpoint: {
              city: "Osaka",
              role: "STAY" as const,
              days: 3,
              needs: ["hotels" as const],
            },
            results: [
              {
                ok: true,
                tool: "search_hotels",
                data: {
                  provider: "mock",
                  hotels: [{ hotelId: "h1", name: "Hotel A", price: { amount: 50, currency: "USD" } }],
                },
              },
            ],
          },
        ],
      }),
    };

    let rolled = false;
    const cost = {
      rollupTrip: async () => {
        rolled = true;
      },
    };

    const service = new JourneyService(db as never, {
      planner: planner as never,
      cost: cost as never,
      policy: {
        canAiMutate: () => true,
      } as never,
    });

    const result = await service.planTrip({
      tripId: "trip-1",
      userId: "user-1",
      prompt: "Liburan ke Osaka",
    });

    assert.equal(result.llm, "heuristic");
    assert.equal(result.mcp, "inprocess");
    assert.ok(created.some((n) => n.type === "CHECKPOINT" && n.title === "Osaka"));
    assert.ok(created.some((n) => n.type === "BOOKING" && n.title === "Hotel A"));
    assert.equal(rolled, true);
    assert.equal(tripRow.status, "ready");
  });
});
