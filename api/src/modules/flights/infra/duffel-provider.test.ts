import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { loadEnv } from "../../../config/env.js";
import { baseEnv, stubFetch } from "../../../test/helpers.js";
import {
  createDuffelFlightProvider,
  DuffelFlightProvider,
} from "./duffel-provider.js";

let restoreFetch: (() => void) | undefined;

afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});

describe("DuffelFlightProvider", () => {
  it("createDuffelFlightProvider requires token", () => {
    assert.equal(
      createDuffelFlightProvider(
        loadEnv(baseEnv({ PROVIDER_FLIGHTS: "duffel", DUFFEL_ACCESS_TOKEN: "t" })),
      ).name,
      "duffel",
    );
    assert.throws(
      () => createDuffelFlightProvider(loadEnv(baseEnv({ PROVIDER_FLIGHTS: "duffel" }))),
      /DUFFEL/,
    );
  });

  it("search error + happy path + duration branches", async () => {
    const provider = new DuffelFlightProvider("tok");

    restoreFetch = stubFetch(
      async () =>
        ({
          ok: false,
          status: 500,
          text: async () => "fail",
        }) as Response,
    );
    await assert.rejects(
      () =>
        provider.searchFlights({
          origin: "CGK",
          destination: "KIX",
          departureDate: "2026-10-01",
        }),
      /Duffel search failed/,
    );

    restoreFetch();
    restoreFetch = stubFetch(
      async () =>
        ({
          ok: true,
          json: async () => ({
            data: {
              offers: [
                {
                  id: "o1",
                  total_amount: "100",
                  total_currency: "USD",
                  slices: [
                    {
                      duration: "PT2H30M",
                      segments: [
                        {
                          operating_carrier: { iata_code: "NH" },
                          operating_carrier_flight_number: "856",
                          departing_at: "2026-10-01T01:00:00Z",
                          arriving_at: "2026-10-01T03:30:00Z",
                          origin: { iata_code: "CGK" },
                          destination: { iata_code: "KIX" },
                          passengers: [{ cabin_class: "economy" }],
                        },
                      ],
                    },
                  ],
                },
                {
                  id: "o2",
                  total_amount: "90",
                  total_currency: "USD",
                  slices: [{ segments: [] }],
                },
              ],
            },
          }),
        }) as Response,
    );

    const offers = await provider.searchFlights({
      origin: "CGK",
      destination: "KIX",
      departureDate: "2026-10-01",
      returnDate: "2026-10-10",
      cabinClass: "business",
    });
    assert.equal(offers[0]?.carrier, "NH");
    assert.equal(offers[0]?.airline.iataCode, "NH");
    assert.equal(offers[0]?.origin, "CGK");
    assert.equal(offers[0]?.destination, "KIX");
    assert.equal(offers[0]?.transit, "direct");
    assert.equal(offers[0]?.stops, 0);
    assert.equal(offers[0]?.durationMinutes, 150);
    assert.equal(offers[1]?.carrier, "Unknown");

    restoreFetch();
    restoreFetch = stubFetch(
      async () =>
        ({
          ok: true,
          json: async () => ({
            data: {
              offers: [
                {
                  id: "o3",
                  total_amount: "1",
                  total_currency: "USD",
                  slices: [
                    {
                      duration: "PT",
                      segments: [
                        {
                          origin: { iata_code: "A" },
                          destination: { iata_code: "B" },
                          departing_at: "t",
                          arriving_at: "t2",
                          operating_carrier: { name: "X" },
                        },
                      ],
                    },
                  ],
                },
                {
                  id: "o4",
                  total_amount: "1",
                  total_currency: "USD",
                  slices: [
                    {
                      duration: "nope",
                      segments: [
                        {
                          origin: { iata_code: "A" },
                          destination: { iata_code: "B" },
                          departing_at: "t",
                          arriving_at: "t2",
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          }),
        }) as Response,
    );
    const more = await provider.searchFlights({
      origin: "AAA",
      destination: "BBB",
      departureDate: "2026-01-01",
    });
    assert.equal(more[0]?.durationMinutes, 0);
    assert.equal(more[1]?.durationMinutes, 0);
  });

  it("empty offers payload", async () => {
    const provider = new DuffelFlightProvider("tok");
    restoreFetch = stubFetch(
      async () => ({ ok: true, json: async () => ({}) }) as Response,
    );
    assert.deepEqual(
      await provider.searchFlights({
        origin: "CGK",
        destination: "KIX",
        departureDate: "2026-10-01",
      }),
      [],
    );
  });
});
