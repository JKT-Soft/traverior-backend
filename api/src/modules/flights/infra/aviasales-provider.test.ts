import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { loadEnv } from "../../../config/env.js";
import { baseEnv, stubFetch } from "../../../test/helpers.js";
import {
  AviasalesFlightProvider,
  createAviasalesFlightProvider,
} from "./aviasales-provider.js";

let restoreFetch: (() => void) | undefined;

afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});

describe("AviasalesFlightProvider", () => {
  it("createAviasalesFlightProvider requires token", () => {
    assert.equal(
      createAviasalesFlightProvider(
        loadEnv(
          baseEnv({
            PROVIDER_FLIGHTS: "aviasales",
            TRAVELPAYOUTS_TOKEN: "tok",
            TRAVELPAYOUTS_CURRENCY: "idr",
            TRAVELPAYOUTS_MARKET: "id",
            TRAVELPAYOUTS_MARKER: "42",
          }),
        ),
      ).name,
      "aviasales",
    );
    assert.throws(
      () =>
        createAviasalesFlightProvider(
          loadEnv(baseEnv({ PROVIDER_FLIGHTS: "aviasales" })),
        ),
      /TRAVELPAYOUTS_TOKEN/,
    );
  });

  it("search error + success path", async () => {
    const provider = new AviasalesFlightProvider("tok", {
      currency: "usd",
      market: "us",
      marker: "99",
    });

    restoreFetch = stubFetch(
      async () =>
        ({
          ok: false,
          status: 403,
          text: async () => "forbidden",
        }) as Response,
    );
    await assert.rejects(
      () =>
        provider.searchFlights({
          origin: "CGK",
          destination: "NRT",
          departureDate: "2026-11-15",
        }),
      /Aviasales search failed \(403\)/,
    );

    restoreFetch();
    restoreFetch = stubFetch(async (input) => {
      const url = String(input);
      assert.match(url, /origin=CGK/);
      assert.match(url, /destination=NRT/);
      assert.match(url, /one_way=false/);
      assert.match(url, /return_at=2026-11-25/);
      assert.match(url, /market=us/);
      return {
        ok: true,
        json: async () => ({
          success: true,
          currency: "usd",
          data: [
            {
              origin: "CGK",
              destination: "NRT",
              price: 350,
              airline: "GA",
              flight_number: "882",
              departure_at: "2026-11-15T08:00:00+07:00",
              return_at: "2026-11-25T10:00:00+09:00",
              transfers: 0,
              return_transfers: 0,
              duration_to: 400,
              duration_back: 410,
              link: "/search/CGKNRT",
            },
          ],
        }),
      } as Response;
    });

    const offers = await provider.searchFlights({
      origin: "cgk",
      destination: "nrt",
      departureDate: "2026-11-15",
      returnDate: "2026-11-25",
    });
    assert.equal(offers.length, 1);
    assert.equal(offers[0]?.provider, "aviasales");
    assert.equal(offers[0]?.price.amount, 350);
    assert.equal(offers[0]?.slices.length, 2);
    assert.match(offers[0]?.deepLinkUrl ?? "", /marker=99/);
  });

  it("throws when API returns success=false", async () => {
    const provider = new AviasalesFlightProvider("tok");
    restoreFetch = stubFetch(
      async () =>
        ({
          ok: true,
          json: async () => ({ success: false, error: "bad token", data: {} }),
        }) as Response,
    );
    await assert.rejects(
      () =>
        provider.searchFlights({
          origin: "CGK",
          destination: "NRT",
          departureDate: "2026-11-15",
        }),
      /bad token/,
    );
  });

  it("returns empty list when data is not an array", async () => {
    const provider = new AviasalesFlightProvider("tok");
    restoreFetch = stubFetch(
      async () =>
        ({
          ok: true,
          json: async () => ({ success: true, data: {} }),
        }) as Response,
    );
    const offers = await provider.searchFlights({
      origin: "CGK",
      destination: "NRT",
      departureDate: "2026-11-15",
    });
    assert.deepEqual(offers, []);
  });
});
