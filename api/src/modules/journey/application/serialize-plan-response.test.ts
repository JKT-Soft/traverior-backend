import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { serializePlanResponse } from "./serialize-plan-response.js";

describe("serializePlanResponse", () => {
  it("converts flat nodes into stops and typed catalogs", () => {
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
        nodes: [
          {
            id: "root",
            parentId: null,
            sortOrder: 0,
            type: "JOURNEY",
            title: "Japan Journey",
          },
          {
            id: "origin",
            parentId: "root",
            sortOrder: 1,
            type: "CHECKPOINT",
            checkpointKind: "ORIGIN",
            title: "Jakarta",
            contentType: "checkpoint",
            content: { city: "Jakarta" },
          },
          {
            id: "outbound",
            parentId: "root",
            sortOrder: 2,
            type: "LEG",
            title: "Flight to Tokyo",
            contentType: "leg",
          },
          {
            id: "tokyo",
            parentId: "root",
            sortOrder: 3,
            type: "CHECKPOINT",
            checkpointKind: "STAY",
            title: "Tokyo",
            contentType: "checkpoint",
            content: {
              city: "Tokyo",
              days: 4,
              startDate: "2026-10-01",
              endDate: "2026-10-05",
            },
          },
          {
            id: "flight-node",
            parentId: "tokyo",
            sortOrder: 1,
            type: "BOOKING",
            title: "Airline 123",
            contentType: "flight",
            content: { origin: "CGK", destination: "NRT" },
            costAmount: 500,
            costCurrency: "IDR",
          },
          {
            id: "hotel-node",
            parentId: "tokyo",
            sortOrder: 2,
            type: "BOOKING",
            title: "Tokyo Hotel",
            contentType: "hotel",
            content: { name: "Tokyo Hotel" },
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
