import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { serializePlanResponse } from "./serialize-plan-response.js";

describe("serializePlanResponse", () => {
  it("serializes stops and typed catalog rows", () => {
    const response = serializePlanResponse({
      llm: "mock-llm",
      mcp: "inprocess",
      clarifications: [],
      trip: {
        id: "trip-1",
        userId: "user-1",
        title: "Japan",
        status: "ready",
        originCity: "Jakarta",
        startDate: new Date("2026-10-01"),
        endDate: new Date("2026-10-05"),
        baseCurrency: "IDR",
        totalCostAmount: 500,
        journey: {
          id: "journey-1",
          name: "Japan Journey",
          stops: [
            {
              id: "origin",
              sortOrder: 1,
              kind: "hub",
              hubRole: "origin",
              slug: "hub_origin",
              name: "Jakarta",
              city: "Jakarta",
              scheduleStart: new Date("2026-10-01"),
            },
            {
              id: "outbound",
              sortOrder: 2,
              kind: "travel",
              slug: "travel_outbound",
              name: "Flight to Tokyo",
              bookings: [
                {
                  id: "flight-booking",
                  kind: "flight",
                  costAmount: 500,
                  costCurrency: "IDR",
                  flight: {
                    id: "flight-row",
                    name: "Airline 123",
                    raw: { origin: "CGK", destination: "NRT" },
                  },
                },
              ],
            },
            {
              id: "tokyo",
              sortOrder: 3,
              kind: "stay",
              slug: "stay_tokyo",
              name: "Tokyo",
              city: "Tokyo",
              days: 4,
              dateStart: "2026-10-01",
              dateEnd: "2026-10-05",
              bookings: [
                {
                  id: "hotel-booking",
                  kind: "hotel",
                  hotel: { id: "hotel-row", name: "Tokyo Hotel", raw: { name: "Tokyo Hotel" } },
                },
                {
                  id: "checklist-booking",
                  kind: "checklist",
                  checklist: {
                    id: "44444444-4444-4444-8444-444444444444",
                    title: "Travel checklist",
                    items: [
                      { id: "passport", label: "Passport", done: false, source: "template" },
                    ],
                    raw: {
                      checklist: {
                        items: [
                          { id: "passport", label: "Passport", done: false, source: "template" },
                        ],
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
        checklists: [
          {
            id: "44444444-4444-4444-8444-444444444444",
            title: "Travel checklist",
            items: [{ id: "passport", label: "Passport", done: false, source: "template" }],
          },
        ],
      },
    });

    assert.equal(response.trip.name, "Japan");
    assert.equal(response.journey.name, "Japan Journey");
    assert.deepEqual(
      response.journey.stops.map((stop) => stop.kind),
      ["hub", "travel", "stay"],
    );
    assert.equal(Object.keys(response.catalog.flights).length, 1);
    assert.equal(Object.keys(response.catalog.hotels).length, 1);
    assert.equal(Object.keys(response.catalog.checklists).length, 1);
    const checklist = Object.values(response.catalog.checklists)[0]!;
    assert.equal(checklist.catalogId, "44444444-4444-4444-8444-444444444444");
    assert.ok(Array.isArray(checklist.items));
    assert.equal((checklist.items as unknown[]).length, 1);
    assert.equal(response.meta.schema, "trip+journey.stops+catalog");
    assert.equal(response.meta.llm, "mock-llm");
    assert.equal((response.trip as { nodes?: unknown }).nodes, undefined);

    const travel = response.journey.stops[1]!;
    const stay = response.journey.stops[2]!;
    assert.deepEqual(
      (travel.bookings as { flightIds: string[] }).flightIds,
      (stay.bookings as { flightIds: string[] }).flightIds,
    );
  });
});
