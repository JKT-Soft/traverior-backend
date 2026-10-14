import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildToolCallsForNeed, buildToolPlan } from "./need-tools.js";

describe("need-tools", () => {
  it("builds hotel and places calls", () => {
    const calls = buildToolCallsForNeed(
      "hotels",
      { city: "Osaka", role: "STAY", days: 3, needs: ["hotels"] },
      { checkIn: "2026-10-01", checkOut: "2026-10-04" },
    );
    assert.equal(calls[0]?.tool, "search_hotels");
    assert.equal(calls[0]?.arguments.cityName, "Osaka");
  });

  it("skips flights when context incomplete", () => {
    const calls = buildToolCallsForNeed(
      "flights",
      { city: "Tokyo", role: "STAY", days: 2, needs: ["flights"] },
      {},
    );
    assert.equal(calls.length, 0);
  });

  it("builds full plan per checkpoint", () => {
    const plan = buildToolPlan(
      {
        title: "JP",
        checkpoints: [
          {
            city: "Osaka",
            countryCode: "JP",
            role: "STAY",
            days: 2,
            needs: ["hotels", "places"],
          },
        ],
      },
      { checkIn: "2026-10-01", checkOut: "2026-10-03" },
    );
    assert.equal(plan.length, 1);
    assert.ok(plan[0]!.calls.length >= 2);
  });

  it("uses each city's stay window for hotel search", () => {
    const plan = buildToolPlan(
      {
        title: "Europe",
        checkpoints: [
          { city: "London", countryCode: "GB", role: "STAY", days: 2, needs: ["hotels"] },
          { city: "Barcelona", countryCode: "ES", role: "STAY", days: 2, needs: ["hotels"] },
        ],
      },
      { checkIn: "2026-10-01", checkOut: "2026-10-04" },
    );

    assert.equal(plan[0]?.calls[0]?.arguments.checkIn, "2026-10-01");
    assert.equal(plan[0]?.calls[0]?.arguments.checkOut, "2026-10-03");
    assert.equal(plan[1]?.calls[0]?.arguments.checkIn, "2026-10-03");
    assert.equal(plan[1]?.calls[0]?.arguments.checkOut, "2026-10-05");
  });

  it("searches outbound on first city, inbound hop + return on last", () => {
    const plan = buildToolPlan(
      {
        title: "Japan",
        checkpoints: [
          {
            city: "Tokyo",
            countryCode: "JP",
            airportIata: "NRT",
            role: "STAY",
            days: 3,
            needs: ["flights"],
          },
          {
            city: "Osaka",
            countryCode: "JP",
            airportIata: "KIX",
            role: "STAY",
            days: 2,
            needs: ["flights"],
          },
        ],
      },
      {
        originIata: "CGK",
        destinationIata: "NRT",
        checkIn: "2026-10-01",
        checkOut: "2026-10-08",
        departureDate: "2026-10-01",
        returnDate: "2026-10-08",
      },
    );

    const outbound = plan[0]?.calls.find((c) => c.tool === "search_flights");
    const lastFlights = plan[1]?.calls.filter((c) => c.tool === "search_flights") ?? [];

    assert.deepEqual(outbound?.arguments, {
      origin: "CGK",
      destination: "NRT",
      departureDate: "2026-10-01",
      returnDate: undefined,
      adults: 1,
    });
    assert.equal(lastFlights.length, 2);
    assert.deepEqual(lastFlights[0]?.arguments, {
      origin: "NRT",
      destination: "KIX",
      departureDate: "2026-10-06",
      returnDate: undefined,
      adults: 1,
    });
    assert.deepEqual(lastFlights[1]?.arguments, {
      origin: "KIX",
      destination: "CGK",
      departureDate: "2026-10-08",
      returnDate: undefined,
      adults: 1,
    });
  });

  it("skips inbound hop on last city when airport is unchanged (rail belt)", () => {
    const plan = buildToolPlan(
      {
        title: "Japan rail",
        checkpoints: [
          {
            city: "Tokyo",
            countryCode: "JP",
            airportIata: "NRT",
            role: "STAY",
            days: 3,
            needs: ["flights"],
          },
          {
            city: "Kyoto",
            countryCode: "JP",
            airportIata: "KIX",
            role: "STAY",
            days: 2,
            needs: [],
          },
          {
            city: "Osaka",
            countryCode: "JP",
            airportIata: "KIX",
            role: "STAY",
            days: 2,
            needs: ["flights"],
          },
        ],
      },
      {
        originIata: "CGK",
        checkIn: "2026-10-01",
        checkOut: "2026-10-08",
        departureDate: "2026-10-01",
        returnDate: "2026-10-08",
      },
    );

    expectFlight(plan[0]?.calls, "CGK", "NRT", "2026-10-01");
    assert.equal(plan[1]?.calls.some((c) => c.tool === "search_flights"), false);
    const lastFlights = plan[2]?.calls.filter((c) => c.tool === "search_flights") ?? [];
    assert.equal(lastFlights.length, 1);
    expectFlight(lastFlights, "KIX", "CGK", "2026-10-08");
  });

  it("uses round-trip search for a single-city trip", () => {
    const plan = buildToolPlan(
      {
        title: "Singapore",
        checkpoints: [
          { city: "Singapore", countryCode: "SG", role: "STAY", days: 4, needs: ["flights"] },
        ],
      },
      {
        originIata: "CGK",
        destinationIata: "SIN",
        checkIn: "2026-11-01",
        checkOut: "2026-11-05",
        departureDate: "2026-11-01",
        returnDate: "2026-11-05",
      },
    );

    assert.deepEqual(plan[0]?.calls[0]?.arguments, {
      origin: "CGK",
      destination: "SIN",
      departureDate: "2026-11-01",
      returnDate: "2026-11-05",
      adults: 1,
    });
  });

  it("resolves home and city airports when context omits all IATA codes", () => {
    const plan = buildToolPlan(
      {
        title: "North Asia",
        originCity: "Jakarta",
        checkpoints: [
          { city: "Tokyo", countryCode: "JP", role: "STAY", days: 2, needs: ["flights"] },
          { city: "Taipei", countryCode: "TW", role: "STAY", days: 2, needs: ["flights"] },
          { city: "Seoul", countryCode: "KR", role: "STAY", days: 2, needs: ["flights"] },
        ],
      },
      {
        departureDate: "2026-12-01",
        returnDate: "2026-12-07",
        checkIn: "2026-12-01",
        checkOut: "2026-12-07",
      },
    );

    expectFlight(plan[0]?.calls, "CGK", "NRT", "2026-12-01");
    expectFlight(plan[1]?.calls, "NRT", "TPE", "2026-12-04");
    const lastFlights = plan[2]?.calls.filter((call) => call.tool === "search_flights") ?? [];
    assert.equal(lastFlights.length, 2);
    expectFlight([lastFlights[0]!], "TPE", "ICN", "2026-12-06");
    expectFlight([lastFlights[1]!], "ICN", "CGK", "2026-12-07");
  });

  it("uses skeleton airport codes when request context omits IATA codes", () => {
    const plan = buildToolPlan(
      {
        title: "Europe",
        originCity: "Jakarta",
        originIata: "CGK",
        checkpoints: [
          {
            city: "London",
            countryCode: "GB",
            airportIata: "LHR",
            role: "STAY",
            days: 2,
            needs: ["flights"],
          },
          {
            city: "Paris",
            countryCode: "FR",
            airportIata: "CDG",
            role: "STAY",
            days: 2,
            needs: ["flights"],
          },
          {
            city: "Amsterdam",
            countryCode: "NL",
            airportIata: "AMS",
            role: "STAY",
            days: 2,
            needs: ["flights"],
          },
        ],
      },
      {
        departureDate: "2026-12-01",
        returnDate: "2026-12-07",
        checkIn: "2026-12-01",
        checkOut: "2026-12-07",
      },
    );

    expectFlight(plan[0]?.calls, "CGK", "LHR", "2026-12-01");
    expectFlight(plan[1]?.calls, "LHR", "CDG", "2026-12-04");
    const lastFlights = plan[2]?.calls.filter((call) => call.tool === "search_flights") ?? [];
    assert.equal(lastFlights.length, 2);
    expectFlight([lastFlights[0]!], "CDG", "AMS", "2026-12-06");
    expectFlight([lastFlights[1]!], "AMS", "CGK", "2026-12-07");
  });
});

function expectFlight(
  calls: Array<{ tool: string; arguments: Record<string, unknown> }> | undefined,
  origin: string,
  destination: string,
  departureDate: string,
) {
  const flight = calls?.find((call) => call.tool === "search_flights");
  assert.equal(flight?.arguments.origin, origin);
  assert.equal(flight?.arguments.destination, destination);
  assert.equal(flight?.arguments.departureDate, departureDate);
}
