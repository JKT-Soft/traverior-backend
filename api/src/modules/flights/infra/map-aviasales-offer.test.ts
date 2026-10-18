import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addMinutes,
  buildDeepLink,
  mapAviasalesOffer,
} from "./map-aviasales-offer.js";

describe("map-aviasales-offer", () => {
  it("maps one-way ticket to FlightOffer", () => {
    const offer = mapAviasalesOffer(
      {
        origin: "CGK",
        destination: "NRT",
        origin_airport: "CGK",
        destination_airport: "NRT",
        price: 420,
        airline: "ga",
        flight_number: "882",
        departure_at: "2026-11-15T08:00:00+07:00",
        transfers: 0,
        duration_to: 420,
        link: "/search/CGK1511NRT1",
        currency: "usd",
      },
      {
        origin: "CGK",
        destination: "NRT",
        departureDate: "2026-11-15",
        cabinClass: "economy",
      },
      "aviasales",
      { marker: "12345" },
    );

    assert.equal(offer.provider, "aviasales");
    assert.equal(offer.airline.iataCode, "GA");
    assert.equal(offer.flightNumber, "882");
    assert.equal(offer.price.amount, 420);
    assert.equal(offer.price.isEstimate, true);
    assert.equal(offer.transit, "direct");
    assert.equal(offer.slices.length, 1);
    assert.match(offer.deepLinkUrl ?? "", /marker=12345/);
    assert.equal(offer.durationMinutes, 420);
  });

  it("maps round-trip with inbound slice", () => {
    const offer = mapAviasalesOffer(
      {
        origin: "CGK",
        destination: "NRT",
        price: 900,
        airline: "NH",
        flight_number: "856",
        departure_at: "2026-11-15T01:00:00Z",
        return_at: "2026-11-25T10:00:00Z",
        transfers: 1,
        return_transfers: 0,
        duration_to: 500,
        duration_back: 480,
        link: "https://www.aviasales.com/search/round",
      },
      {
        origin: "CGK",
        destination: "NRT",
        departureDate: "2026-11-15",
        returnDate: "2026-11-25",
      },
      "aviasales",
    );

    assert.equal(offer.slices.length, 2);
    assert.equal(offer.transit, "transit");
    assert.equal(offer.stops, 1);
    assert.equal(offer.slices[1]?.stops, 0);
    assert.equal(offer.slices[1]?.origin.code, "NRT");
    assert.equal(offer.deepLinkUrl, "https://www.aviasales.com/search/round");
  });

  it("addMinutes and buildDeepLink helpers", () => {
    assert.equal(addMinutes("not-a-date", 10), "not-a-date");
    assert.equal(buildDeepLink(undefined), undefined);
    assert.equal(
      buildDeepLink("/search/abc", "m1"),
      "https://www.aviasales.com/search/abc?marker=m1",
    );
    assert.match(buildDeepLink("https://www.aviasales.com/x?y=1", "m") ?? "", /&marker=m/);
  });
});
