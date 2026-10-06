import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JourneyService } from "./service.js";

describe("JourneyService planning chat", () => {
  it("builds an initial draft from the first message without provider tools", async () => {
    const messages: unknown[] = [];
    let draftRow: Record<string, unknown> | null = null;
    let tripRow = {
      id: "t1",
      userId: "u1",
      title: "Trip",
      status: "draft",
      originCity: "Jakarta",
      destinationSummary: null as string | null,
      startDate: null as Date | null,
      endDate: null as Date | null,
      partySize: 1,
      baseCurrency: "IDR",
      journey: { id: "j1", name: "Trip", stops: [] },
    };

    const db = {
      user: {
        findUnique: async () => ({ preference: null }),
        upsert: async () => ({ id: "u1" }),
      },
      trip: {
        findFirst: async () => tripRow,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          tripRow = { ...tripRow, ...data };
          return tripRow;
        },
      },
      planningDraft: {
        findUnique: async () => draftRow,
        upsert: async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
          draftRow = { ...(draftRow ?? {}), ...(draftRow ? update : create), tripId: "t1" };
          return draftRow;
        },
        update: async ({ data }: { data: Record<string, unknown> }) => {
          draftRow = { ...(draftRow ?? {}), ...data };
          return draftRow;
        },
      },
      planningMessage: {
        findMany: async () => messages,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const row = { ...data, createdAt: new Date("2026-10-06T09:40:00.000Z") };
          messages.push(row);
          return row;
        },
      },
      $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
    };

    const planner = {
      extractPlanSlots: async () => ({
        llm: "test",
        extracted: {
          destination: "Jepang",
          originCity: "Jakarta",
          startDate: "2026-11-01",
          endDate: "2026-11-07",
          partySize: 2,
        },
        missing: [],
      }),
      planSkeleton: async () => ({
        llm: "test",
        skeleton: {
          title: "Jepang",
          concept: "culture",
          tone: "Tempo santai.",
          originCity: "Jakarta",
          destinationSummary: "Tokyo",
          assumedStartDate: "2026-11-01",
          assumedEndDate: "2026-11-07",
          partySize: 2,
          checkpoints: [
            {
              city: "Tokyo",
              countryCode: "JP",
              airportIata: "NRT",
              role: "STAY",
              days: 4,
              needs: ["flights", "hotels", "places", "events"],
              search: { events: 2, restaurants: 3, places: 4 },
            },
          ],
        },
      }),
      revisePlanningDraft: async () => {
        throw new Error("should not revise on first draft");
      },
    };

    const service = new JourneyService(db as never, { planner: planner as never });
    const state = await service.postPlanningMessage({
      tripId: "t1",
      userId: "u1",
      text: "7 hari Jepang, nuansa budaya, dari Jakarta, 1–7 November.",
    });

    assert.equal(state.phase, "draft");
    assert.equal(state.canSearch, true);
    assert.equal(state.draft.title, "Jepang");
    assert.equal(state.draft.concept, "culture");
    assert.ok(state.messages.some((message) => message.kind === "skeleton"));
    assert.ok(state.messages.some((message) => message.role === "user"));
    assert.equal(tripRow.title, "Jepang");
    assert.equal(tripRow.destinationSummary, "Tokyo");
  });

  it("appends a new skeleton card when the draft changes", async () => {
    const draftCard = {
      title: "Jepang",
      concept: "culture",
      tone: "Tempo santai.",
      originCity: "Jakarta",
      destinationSummary: "Tokyo",
      startDate: "2026-11-01",
      endDate: "2026-11-07",
      partySize: 2,
      selectedStopId: "stay_tokyo",
      stops: [
        { id: "hub_origin", kind: "hub", name: "Jakarta", role: "departure" },
        { id: "travel_jakarta_tokyo", kind: "travel", name: "Terbang", from: "Jakarta", to: "Tokyo", search: { flights: 1 } },
        {
          id: "stay_tokyo",
          kind: "stay",
          name: "Tokyo",
          city: "Tokyo",
          nights: 4,
          search: { hotel: 1, events: 2, restaurants: 3, places: 4 },
        },
        { id: "hub_return", kind: "hub", name: "Jakarta", role: "return" },
      ],
    };

    const messages: Array<Record<string, unknown>> = [
      {
        id: "m1",
        tripId: "t1",
        position: 0,
        role: "user",
        kind: "text",
        body: "7 hari Jepang",
        draftStopId: null,
        payload: null,
        createdAt: new Date("2026-10-06T09:40:00.000Z"),
      },
      {
        id: "m2",
        tripId: "t1",
        position: 1,
        role: "assistant",
        kind: "text",
        body: "Ini rancangannya.",
        draftStopId: null,
        payload: null,
        createdAt: new Date("2026-10-06T09:40:01.000Z"),
      },
      {
        id: "m3",
        tripId: "t1",
        position: 2,
        role: "assistant",
        kind: "skeleton",
        body: null,
        draftStopId: "stay_tokyo",
        payload: { card: draftCard },
        createdAt: new Date("2026-10-06T09:40:02.000Z"),
      },
    ];

    let draftRow: Record<string, unknown> = {
      id: "d1",
      tripId: "t1",
      phase: "draft",
      title: draftCard.title,
      concept: draftCard.concept,
      tone: draftCard.tone,
      originCity: draftCard.originCity,
      startDate: new Date("2026-11-01"),
      endDate: new Date("2026-11-07"),
      partySize: 2,
      selectedStopId: "stay_tokyo",
      stops: draftCard.stops,
    };

    const tripRow = {
      id: "t1",
      userId: "u1",
      title: "Jepang",
      status: "draft",
      originCity: "Jakarta",
      destinationSummary: "Tokyo",
      startDate: new Date("2026-11-01"),
      endDate: new Date("2026-11-07"),
      partySize: 2,
      baseCurrency: "IDR",
      journey: { id: "j1", name: "Jepang", stops: [] },
    };

    const db = {
      user: { findUnique: async () => ({ preference: null }) },
      trip: {
        findFirst: async () => tripRow,
        update: async () => tripRow,
      },
      planningDraft: {
        findUnique: async () => draftRow,
        upsert: async ({ update }: { update: Record<string, unknown> }) => {
          draftRow = { ...draftRow, ...update };
          return draftRow;
        },
      },
      planningMessage: {
        findMany: async () => messages,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const row = { ...data, createdAt: new Date("2026-10-06T09:41:00.000Z") };
          messages.push(row);
          return row;
        },
      },
      $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
    };

    const planner = {
      revisePlanningDraft: async () => ({
        reply: "Acara di Tokyo saya kurangi jadi 1.",
        draftChanged: true,
        skeleton: {
          title: "Jepang",
          concept: "culture",
          tone: "Tempo santai.",
          originCity: "Jakarta",
          destinationSummary: "Tokyo",
          assumedStartDate: "2026-11-01",
          assumedEndDate: "2026-11-07",
          partySize: 2,
          checkpoints: [
            {
              city: "Tokyo",
              countryCode: "JP",
              airportIata: "NRT",
              role: "STAY",
              days: 4,
              needs: ["flights", "hotels", "places", "events"],
              search: { events: 1, restaurants: 3, places: 4 },
            },
          ],
        },
        clarifications: [],
        llm: "test",
      }),
    };

    const service = new JourneyService(db as never, { planner: planner as never });
    const state = await service.postPlanningMessage({
      tripId: "t1",
      userId: "u1",
      text: "Kurangi acara",
      stopId: "stay_tokyo",
    });

    const skeletonMessages = state.messages.filter((message) => message.kind === "skeleton");
    assert.equal(skeletonMessages.length, 2);
    assert.equal(skeletonMessages[0]?.card?.stops.find((s) => s.id === "stay_tokyo")?.search?.events, 2);
    assert.equal(skeletonMessages[1]?.card?.stops.find((s) => s.id === "stay_tokyo")?.search?.events, 1);
    assert.equal(state.draft.stops.find((s) => s.id === "stay_tokyo")?.search?.events, 1);
  });

  it("skips Unsplash while the trip is still a draft", async () => {
    let imageCalls = 0;
    const db = {
      trip: {
        findMany: async () => [
          {
            id: "t1",
            userId: "u1",
            title: "Jepang",
            status: "draft",
            destinationSummary: "Tokyo",
            baseCurrency: "IDR",
            totalCostAmount: 0,
            totalCostIsEstimate: true,
            totalDurationMinutes: 0,
            partySize: 1,
            journey: { id: "j1", name: "Jepang", stops: [] },
          },
        ],
      },
    };
    const images = {
      getLocationThumbnail: async () => {
        imageCalls += 1;
        return "https://example.com/tokyo.jpg";
      },
    };
    const service = new JourneyService(db as never, { images: images as never });
    const trips = await service.listTrips("u1");
    assert.equal(trips[0]?.coverImageUrl, null);
    assert.equal(imageCalls, 0);
  });
});
