import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { loadEnv } from "../../../config/env.js";
import { baseEnv, stubFetch } from "../../../test/helpers.js";
import {
  createGoogleFlightsProvider,
  GoogleFlightsProvider,
} from "./google-flights-provider.js";

let restoreFetch: (() => void) | undefined;

afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});

function wrapHtml(payload: unknown): string {
  return `<html><script class="ds:1" nonce="x">AF_initDataCallback({key: 'ds:1', data:${JSON.stringify(payload)}, sideChannel: {}});</script></html>`;
}

function sampleSearchPayload() {
  return [
    null,
    null,
    [
      [
        [
          [
            "TR",
            ["Scoot"],
            [
              [
                null,
                null,
                null,
                "CGK",
                "Jakarta",
                "Singapore Changi",
                "SIN",
                null,
                [9, 35],
                null,
                [12, 25],
                110,
                null,
                null,
                null,
                null,
                null,
                "Airbus A320neo",
                null,
                null,
                [2026, 11, 15],
                [2026, 11, 15],
                ["TR", "275", null, "Scoot"],
                null,
                null,
              ],
            ],
          ],
          [[null, 173], "CjRI-live-token"],
        ],
      ],
    ],
  ];
}

describe("GoogleFlightsProvider", () => {
  it("createGoogleFlightsProvider reads currency/language from env", () => {
    const provider = createGoogleFlightsProvider(
      loadEnv(
        baseEnv({
          PROVIDER_FLIGHTS: "google",
          GOOGLE_FLIGHTS_CURRENCY: "idr",
          GOOGLE_FLIGHTS_LANGUAGE: "id",
        }),
      ),
    );
    assert.equal(provider.name, "google");
  });

  it("search error + success path via HTML scrape", async () => {
    const provider = new GoogleFlightsProvider({ currency: "USD", language: "en" });

    restoreFetch = stubFetch(
      async () =>
        ({
          ok: false,
          status: 503,
          text: async () => "unavailable",
        }) as Response,
    );
    await assert.rejects(
      () =>
        provider.searchFlights({
          origin: "CGK",
          destination: "KIX",
          departureDate: "2026-11-15",
        }),
      /Google Flights search failed \(503\)/,
    );

    restoreFetch();
    restoreFetch = stubFetch(async (input, init) => {
      const url = String(input);
      assert.match(url, /travel\/flights/);
      assert.match(url, /curr=USD/);
      assert.equal(init?.method ?? "GET", "GET");
      return {
        ok: true,
        text: async () => wrapHtml(sampleSearchPayload()),
      } as Response;
    });

    const offers = await provider.searchFlights({
      origin: "cgk",
      destination: "sin",
      departureDate: "2026-11-15",
      cabinClass: "economy",
    });
    assert.equal(offers.length, 1);
    assert.equal(offers[0]?.provider, "google");
    assert.equal(offers[0]?.price.amount, 173);
    assert.equal(offers[0]?.flightNumber, "TR275");
    assert.equal(offers[0]?.airline.iataCode, "TR");
    assert.equal(offers[0]?.carrier, "Scoot");
    assert.equal(offers[0]?.originAirport.name, "Jakarta");
    assert.equal(offers[0]?.bookingToken, "CjRI-live-token");
    assert.match(offers[0]?.deepLinkUrl ?? "", /tfu=/);
  });

  it("getOfferDetail returns Playwright vendor list when available", async () => {
    restoreFetch = stubFetch(
      async () =>
        ({
          ok: true,
          text: async () => wrapHtml(sampleSearchPayload()),
        }) as Response,
    );

    const provider = new GoogleFlightsProvider({
      currency: "USD",
      language: "en",
      fetchBookingOptions: async () => [
        {
          id: "GA-0",
          agency: "Garuda Indonesia",
          agencyCode: "GA",
          price: { amount: 420, currency: "USD", isEstimate: true },
          bookingUrl: "https://www.garuda-indonesia.com/book",
          isAirlineDirect: true,
          fareName: "Economy",
          logoUrl: null,
        },
        {
          id: "CTRIP-1",
          agency: "Trip.com",
          agencyCode: "CTRIP",
          price: { amount: 435, currency: "USD", isEstimate: true },
          bookingUrl: "https://www.google.com/travel/clk/f?u=trip",
          isAirlineDirect: false,
          fareName: "Standard",
          logoUrl: null,
        },
      ],
    });

    const detail = await provider.getOfferDetail({
      origin: "CGK",
      destination: "SIN",
      departureDate: "2026-11-15",
      flightNumber: "TR275",
      bookingToken: "CjRI-live-token",
    });
    assert.ok(detail);
    assert.equal(detail?.bookingOptions.length, 2);
    assert.equal(detail?.bookingOptions[0]?.agency, "Garuda Indonesia");
    assert.equal(detail?.bookingOptions[0]?.bookingUrl, "https://www.garuda-indonesia.com/book");
    assert.equal(detail?.bookingOptions[1]?.agency, "Trip.com");
  });

  it("getOfferDetail falls back when Playwright returns empty", async () => {
    restoreFetch = stubFetch(
      async () =>
        ({
          ok: true,
          text: async () => wrapHtml(sampleSearchPayload()),
        }) as Response,
    );

    const provider = new GoogleFlightsProvider({
      currency: "USD",
      language: "en",
      fetchBookingOptions: async () => [],
    });

    const detail = await provider.getOfferDetail({
      origin: "CGK",
      destination: "SIN",
      departureDate: "2026-11-15",
      bookingToken: "CjRI-live-token",
    });
    assert.ok(detail);
    assert.equal(detail?.bookingOptions.length, 1);
    assert.equal(detail?.bookingOptions[0]?.agency, "Scoot");
    assert.equal(detail?.bookingOptions[0]?.isAirlineDirect, true);
    assert.match(detail?.bookingOptions[0]?.bookingUrl ?? "", /tfu=CjRI-live-token/);
    assert.notEqual(detail?.bookingOptions[0]?.agency, "Google Flights");
  });

  it("throws on captcha page", async () => {
    const provider = new GoogleFlightsProvider();
    restoreFetch = stubFetch(
      async () =>
        ({
          ok: true,
          text: async () => '<html><div class="g-recaptcha"></div></html>',
        }) as Response,
    );
    await assert.rejects(
      () =>
        provider.searchFlights({
          origin: "CGK",
          destination: "KIX",
          departureDate: "2026-11-15",
        }),
      /captcha/,
    );
  });
});
