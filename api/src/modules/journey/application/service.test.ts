import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { NotFoundError, PlanNeedsInputError, ValidationError } from "../../../shared/http/errors.js";
import { createMockFn, type MockFn } from "../../../test/helpers.js";
import { JourneyService } from "./service.js";

function createPrismaMock(): {
  user: {
    upsert: MockFn<(...args: never[]) => Promise<unknown>>;
    findUnique: MockFn<(...args: never[]) => Promise<unknown>>;
  };
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
    update: MockFn<(...args: never[]) => Promise<unknown>>;
  };
  applicationLog: {
    create: MockFn<(...args: never[]) => Promise<unknown>>;
    update: MockFn<(...args: never[]) => Promise<unknown>>;
  };
  $transaction: MockFn<(fn: (tx: unknown) => unknown) => Promise<unknown>>;
} {
  return {
    user: {
      upsert: createMockFn(async () => ({ id: "user-1", firebaseUid: "fb" })),
      findUnique: createMockFn(async () => null),
    },
    trip: {
      create: createMockFn(async () => ({})),
      findMany: createMockFn(async () => []),
      findFirst: createMockFn(async () => null),
      update: createMockFn(async () => ({})),
    },
    journey: {
      create: createMockFn(async () => ({ id: "journey-1", name: "Trip", stops: [] })),
      update: createMockFn(async () => ({})),
    },
    stop: {
      create: createMockFn(async () => ({ id: "stop-1", name: "Hotel", kind: "activity" })),
      findMany: createMockFn(async () => []),
      update: createMockFn(async () => ({})),
    },
    applicationLog: {
      create: createMockFn(async () => ({ id: "plan-log-1" })),
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
        },
        journey: {
          create: createMockFn(async () => ({ id: "journey-1", name: "Japan", stops: [] })),
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
      title: "Japan",
      baseCurrency: "IDR",
      journey: {
        id: "root-1",
        name: "Japan",
        stops: [
          { id: "child-1", parentStopId: null, depth: 1, path: "journey/stay_osaka", slug: "stay_osaka", kind: "stay", name: "Osaka" },
        ],
      },
    }));
    const trip = await service.getTrip("trip-1", "user-1");
    assert.equal(trip.journey?.stops.length, 1);

    prismaMock.stop.findMany = createMockFn(async () => [{ id: "child-1", kind: "stay", name: "Osaka" }]);
    assert.equal((await service.listChildren("trip-1", "user-1", "root-1")).length, 1);
    await service.listChildren("trip-1", "user-1", null);

    prismaMock.stop.create = createMockFn(async () => ({ id: "n2", name: "Hotel", kind: "activity" }));
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

    prismaMock.stop.create = createMockFn(async () => ({ id: "n3", name: "x", kind: "activity" }));
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
      journey: {
        create: async () => ({ id: "j1", stops: [] }),
        update: async () => ({}),
      },
      stop: {
        create: async () => ({}),
        findMany: async () => [],
        update: async () => ({}),
      },
      $transaction: async (fn: (tx: never) => unknown) =>
        fn({
          trip: {
            create: async () => ({ id: "t1", userId: "u1", title: "T", baseCurrency: "IDR" }),
          },
          journey: { create: async () => ({ id: "j1", name: "T", stops: [] }) },
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
      title: "Japan",
      baseCurrency: "IDR",
      journey: { id: "root-1", name: "Japan", stops: [] as Array<Record<string, unknown>> },
    };
    const db = {
      user: { upsert: async () => ({ id: "user-1" }) },
      trip: {
        findMany: async () => {
          listCalls += 1;
          return [{ id: "trip-1", title: "Japan" }];
        },
        findFirst: async () => {
          getCalls += 1;
          return tripRow;
        },
        create: async () => ({}),
        update: async () => ({}),
      },
      journey: { create: async () => ({ id: "j1", stops: [] }), update: async () => ({}) },
      stop: {
        create: async () => ({ id: "n2", name: "Cafe", kind: "activity" }),
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
          },
          journey: { create: async () => ({ id: "root-2", name: "New", stops: [] }) },
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

  it("planTrip persists stops, catalog rows, and rolls up cost", async () => {
    const created: Array<{ kind: string; name: string; path?: string }> = [];
    const planLogUpdates: Array<Record<string, unknown>> = [];
    const hotels = new Map<string, Record<string, unknown>>();
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
      journey: {
        id: "journey-1",
        name: "Draft",
        stops: [] as Array<Record<string, unknown>>,
      },
    };

    const db = {
      user: {
        upsert: async () => ({ id: "user-1" }),
        findUnique: async () => ({
          id: "user-1",
          preference: {
            budgetStyle: "balanced",
            pace: "moderate",
            extra: { originCity: "Surabaya", passportCountry: "ID" },
          },
        }),
      },
      trip: {
        findMany: async () => [],
        findFirst: async () => tripRow,
        create: async () => ({}),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(tripRow, data);
          return tripRow;
        },
      },
      journey: {
        update: async ({ data }: { data: { name?: string } }) => {
          tripRow.journey.name = data.name ?? tripRow.journey.name;
          return tripRow.journey;
        },
      },
      stop: {
        findMany: async () => [],
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const row = {
            id: `s-${tripRow.journey.stops.length + 1}`,
            parentStopId: null,
            bookings: [] as Array<Record<string, unknown>>,
            medias: [],
            notes: [],
            budgets: [],
            ...data,
          };
          created.push({ kind: String(data.kind), name: String(data.name), path: String(data.path) });
          tripRow.journey.stops.push(row);
          return row;
        },
        update: async () => ({}),
      },
      catalogHotel: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `hotel-${hotels.size + 1}`, ...data };
          hotels.set(row.id, row);
          return row;
        },
      },
      booking: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const stop = tripRow.journey.stops.find((item) => item.id === data.stopId);
          const booking = {
            id: "booking-hotel",
            ...data,
            hotel: data.catalogHotelId ? hotels.get(String(data.catalogHotelId)) : null,
            flight: null,
            event: null,
            place: null,
            route: null,
            weather: null,
            visa: null,
            checklist: null,
          };
          (stop?.bookings as Array<Record<string, unknown>> | undefined)?.push(booking);
          created.push({ kind: "hotel", name: String((booking.hotel as { name?: string } | null)?.name ?? "") });
          return booking;
        },
      },
      applicationLog: {
        create: async () => ({ id: "plan-log-1" }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          planLogUpdates.push(data);
          return {};
        },
      },
      $transaction: async (fn: (tx: never) => unknown) => fn({} as never),
    };

    const planner = {
      mcpName: "inprocess",
      extractPlanSlots: async () => ({
        llm: "heuristic",
        extracted: { destination: "Osaka", startDate: "2026-10-01", endDate: "2026-10-04" },
        missing: [],
      }),
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
    });

    const result = await service.planTrip({
      tripId: "trip-1",
      userId: "user-1",
      prompt: "Liburan ke Osaka",
      preferences: { startDate: "2026-10-01", endDate: "2026-10-04" },
    });

    assert.equal(result.meta.llm, "heuristic");
    assert.equal(result.meta.mcp, "inprocess");
    assert.equal(result.trip.name, "Japan Adventure");
    assert.ok(result.journey.stops.some((stop) => stop.name === "Osaka"));
    assert.equal(Object.keys(result.catalog.hotels).length, 1);
    assert.ok(created.some((n) => n.kind === "stay" && n.name === "Osaka"));
    assert.ok(created.some((n) => n.kind === "hotel" && n.name === "Hotel A"));
    assert.equal(rolled, true);
    assert.equal(tripRow.status, "ready");
    assert.ok(tripRow.startDate);
    assert.ok(tripRow.endDate);
    assert.ok(
      planLogUpdates.some(
        (data) =>
          data.message === "LLM skeleton generated" &&
          typeof data.payload === "object",
      ),
    );
    assert.ok(planLogUpdates.some((data) => data.status === "completed" && data.result));
    const completed = planLogUpdates.find(
      (data) => data.status === "completed" && data.result,
    );
    const logged = completed?.result as {
      journey?: { stops?: unknown[] };
      catalog?: { hotels?: Record<string, unknown> };
      meta?: { schema?: string };
      trip?: { nodes?: unknown };
    };
    assert.equal(logged?.meta?.schema, "trip+journey.stops+catalog");
    assert.ok(Array.isArray(logged?.journey?.stops));
    assert.equal(Object.keys(logged?.catalog?.hotels ?? {}).length, 1);
    assert.equal(logged?.trip?.nodes, undefined);
  });

  it("planTrip rejects flexible-only dates without a concrete startDate", async () => {
    const tripRow = {
      id: "trip-1",
      userId: "user-1",
      title: "Draft",
      status: "draft",
      partySize: 1,
      baseCurrency: "IDR",
      originCity: "Jakarta",
      destinationSummary: null,
      startDate: null as Date | string | null,
      endDate: null as Date | string | null,
      nodes: [{ id: "root-1", parentId: null, depth: 0, path: "trip", title: "Draft" }],
    };
    const db = {
      user: {
        upsert: async () => ({ id: "user-1" }),
        findUnique: async () => ({ id: "user-1", preference: null }),
      },
      trip: {
        findMany: async () => [],
        findFirst: async () => tripRow,
        create: async () => ({}),
        update: async () => tripRow,
      },
      pipelineNode: { findMany: async () => [], create: async () => ({}), update: async () => ({}) },
      $transaction: async (fn: (tx: never) => unknown) => fn({} as never),
    };
    let planned = false;
    const planner = {
      mcpName: "inprocess",
      extractPlanSlots: async () => ({
        llm: "heuristic",
        extracted: { destination: "Osaka", dateFlexibility: "flexible" as const },
        missing: [],
      }),
      planSkeleton: async () => {
        planned = true;
        return { llm: "heuristic", skeleton: { title: "X", checkpoints: [] } };
      },
      executeSkeletonNeeds: async () => ({ mcp: "inprocess", checkpoints: [] }),
    };
    const service = new JourneyService(db as never, { planner: planner as never });

    await assert.rejects(
      () =>
        service.planTrip({
          tripId: "trip-1",
          userId: "user-1",
          prompt: "Liburan ke Osaka kapan saja",
          preferences: { dateFlexibility: "flexible" },
        }),
      (err: unknown) => {
        assert.equal(err instanceof PlanNeedsInputError, true);
        const clarifications = (err as PlanNeedsInputError).details?.clarifications as Array<{ id: string }>;
        assert.equal(clarifications[0]?.id, "dates");
        return true;
      },
    );
    assert.equal(planned, false);
  });

  it("planTrip keeps a locked stay and still rolls up cost", async () => {
    const created: string[] = [];
    const deleted: string[] = [];
    const tripRow = {
      id: "trip-1",
      userId: "user-1",
      title: "Draft",
      status: "draft",
      partySize: 1,
      baseCurrency: "IDR",
      originCity: "Jakarta",
      destinationSummary: "Osaka",
      startDate: null,
      endDate: null,
      journey: { id: "journey-1", name: "Draft", stops: [] as Array<Record<string, unknown>> },
    };
    const existing = [
      {
        id: "city-1",
        parentStopId: null,
        path: "journey/stay_osaka",
        kind: "stay",
        origin: "ai",
        sortOrder: 2,
        isLocked: true,
        isCustom: false,
        suppressAiRestore: false,
        deletedAt: null,
      },
    ];
    const db = {
      user: {
        upsert: async () => ({ id: "user-1" }),
        findUnique: async () => ({ id: "user-1", preference: null }),
      },
      trip: {
        findMany: async () => [],
        findFirst: async () => tripRow,
        create: async () => ({}),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(tripRow, data);
          return tripRow;
        },
      },
      journey: { update: async () => tripRow.journey },
      stop: {
        findMany: async () => existing,
        create: async ({ data }: { data: { path: string } }) => {
          created.push(data.path);
          return { id: `n-${created.length}`, ...data };
        },
        update: async ({ where, data }: { where: { id: string }; data: { deletedAt?: Date } }) => {
          if (data.deletedAt) deleted.push(where.id);
          return {};
        },
      },
      $transaction: async (fn: (tx: never) => unknown) => fn({} as never),
    };
    const planner = {
      mcpName: "inprocess",
      extractPlanSlots: async () => ({
        llm: "heuristic",
        extracted: { destination: "Osaka", startDate: "2026-10-01", endDate: "2026-10-04" },
        missing: [],
      }),
      planSkeleton: async () => ({
        llm: "heuristic",
        skeleton: {
          title: "Japan Adventure",
          originCity: "Jakarta",
          checkpoints: [
            { city: "Osaka", countryCode: "JP", role: "STAY" as const, days: 3, needs: ["hotels" as const] },
          ],
        },
      }),
      executeSkeletonNeeds: async () => ({
        mcp: "inprocess",
        checkpoints: [
          {
            checkpoint: { city: "Osaka", role: "STAY" as const, days: 3, needs: ["hotels" as const] },
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
    const service = new JourneyService(db as never, {
      planner: planner as never,
      cost: {
        rollupTrip: async () => {
          rolled = true;
          return { totalCostAmount: 50, totalDurationMinutes: 0 };
        },
      } as never,
    });

    await service.planTrip({
      tripId: "trip-1",
      userId: "user-1",
      prompt: "Liburan ke Osaka",
      preferences: { startDate: "2026-10-01", endDate: "2026-10-04" },
    });

    assert.equal(deleted.includes("city-1"), false);
    assert.equal(created.includes("journey/stay_osaka"), false);
    assert.equal(rolled, true);
    assert.equal(tripRow.status, "ready");
  });

  it("planTrip asks for dates instead of inventing them", async () => {
    let planned = false;
    const tripRow = {
      id: "trip-1",
      userId: "user-1",
      title: "Draft",
      status: "draft",
      partySize: 1,
      baseCurrency: "IDR",
      originCity: "Surabaya",
      destinationSummary: null,
      startDate: null,
      endDate: null,
      nodes: [{ id: "root-1", parentId: null, depth: 0, path: "trip", title: "Draft" }],
    };
    const db = {
      user: {
        upsert: async () => ({ id: "user-1" }),
        findUnique: async () => ({ id: "user-1", preference: null }),
      },
      trip: {
        findMany: async () => [],
        findFirst: async () => tripRow,
        create: async () => ({}),
        update: async () => tripRow,
      },
      pipelineNode: { findMany: async () => [], create: async () => ({}), update: async () => ({}) },
      $transaction: async (fn: (tx: never) => unknown) => fn({} as never),
    };
    const planner = {
      mcpName: "inprocess",
      extractPlanSlots: async () => ({
        llm: "heuristic",
        extracted: { destination: "Osaka" },
        missing: [
          {
            id: "dates",
            field: "startDate",
            severity: "required" as const,
            question: "Kapan berangkat?",
            input: "date_range" as const,
            options: ["flexible"],
          },
        ],
      }),
      planSkeleton: async () => {
        planned = true;
        return { llm: "heuristic", skeleton: { title: "X", checkpoints: [] } };
      },
      executeSkeletonNeeds: async () => ({ mcp: "inprocess", checkpoints: [] }),
    };
    const service = new JourneyService(db as never, { planner: planner as never });

    await assert.rejects(
      () =>
        service.planTrip({
          tripId: "trip-1",
          userId: "user-1",
          prompt: "Liburan ke Osaka",
        }),
      (err: unknown) => {
        assert.equal(err instanceof PlanNeedsInputError, true);
        const error = err as PlanNeedsInputError;
        assert.equal(error.status, 409);
        assert.equal(error.code, "PLAN_NEEDS_INPUT");
        const clarifications = error.details?.clarifications as Array<{ id: string }>;
        assert.equal(clarifications[0]?.id, "dates");
        assert.equal((error.details?.extracted as { destination?: string })?.destination, "Osaka");
        return true;
      },
    );
    assert.equal(planned, false);
    assert.equal(tripRow.status, "draft");
  });

  it("planTrip persists user dates on retry", async () => {
    const tripRow = {
      id: "trip-1",
      userId: "user-1",
      title: "Draft",
      status: "draft",
      partySize: 1,
      baseCurrency: "IDR",
      originCity: "Surabaya",
      destinationSummary: null,
      startDate: null as Date | string | null,
      endDate: null as Date | string | null,
      journey: { id: "journey-1", name: "Draft", stops: [] as Array<Record<string, unknown>> },
    };
    const db = {
      user: {
        upsert: async () => ({ id: "user-1" }),
        findUnique: async () => ({ id: "user-1", preference: null }),
      },
      trip: {
        findMany: async () => [],
        findFirst: async () => tripRow,
        create: async () => ({}),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(tripRow, data);
          return tripRow;
        },
      },
      journey: { update: async () => tripRow.journey },
      stop: {
        findMany: async () => [],
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: "n-1", bookings: [], medias: [], notes: [], budgets: [], ...data };
          tripRow.journey.stops.push(row);
          return row;
        },
        update: async () => ({}),
      },
      $transaction: async (fn: (tx: never) => unknown) => fn({} as never),
    };
    const planner = {
      mcpName: "inprocess",
      extractPlanSlots: async () => ({
        llm: "heuristic",
        extracted: { destination: "Osaka", startDate: "2026-11-02", endDate: "2026-11-06" },
        missing: [],
      }),
      planSkeleton: async () => ({
        llm: "heuristic",
        skeleton: {
          title: "Osaka",
          originCity: "Surabaya",
          destinationSummary: "Osaka",
          assumedStartDate: "2026-10-01",
          checkpoints: [
            { city: "Osaka", countryCode: "JP", role: "STAY" as const, days: 3, needs: [] },
          ],
        },
      }),
      executeSkeletonNeeds: async () => ({ mcp: "inprocess", checkpoints: [] }),
    };
    const service = new JourneyService(db as never, {
      planner: planner as never,
    });

    await service.planTrip({
      tripId: "trip-1",
      userId: "user-1",
      prompt: "Liburan ke Osaka",
      preferences: { startDate: "2026-11-02", endDate: "2026-11-06" },
      executeTools: false,
    });

    assert.equal((tripRow.startDate as Date).toISOString().slice(0, 10), "2026-11-02");
    assert.equal((tripRow.endDate as Date).toISOString().slice(0, 10), "2026-11-06");
  });
});
