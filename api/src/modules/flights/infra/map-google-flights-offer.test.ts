import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GoogleFlightsItinerary } from "./google-flights-rpc.js";
import { buildDeepLink, mapGoogleFlightsOffer } from "./map-google-flights-offer.js";

const sample: GoogleFlightsItinerary = {
  typeLabel: "Nonstop",
  price: 425,
  bookingToken: "CjRI-test-token",
  airlineNames: ["Garuda Indonesia"],
  segments: [
    {
      from: { code: "CGK", name: "Soekarno-Hatta" },
      to: { code: "KIX", name: "Kansai" },
      departureAt: "2026-11-15T08:30:00",
      arrivalAt: "2026-11-15T18:45:00",
      durationMinutes: 435,
      flightNumber: "GA882",
      airlineCode: "GA",
      airlineName: "Garuda Indonesia",
      aircraft: "Boeing 777",
    },
  ],
};

describe("mapGoogleFlightsOffer", () => {
  it("maps itinerary to FlightOffer", () => {
    const offer = mapGoogleFlightsOffer(
      sample,
      {
        origin: "CGK",
        destination: "KIX",
        departureDate: "2026-11-15",
        cabinClass: "economy",
      },
      "google",
      { currency: "USD", language: "en" },
    );

    assert.equal(offer.provider, "google");
    assert.equal(offer.carrier, "Garuda Indonesia");
    assert.equal(offer.airline.iataCode, "GA");
    assert.equal(offer.flightNumber, "GA882");
    assert.equal(offer.origin, "CGK");
    assert.equal(offer.destination, "KIX");
    assert.equal(offer.transit, "direct");
    assert.equal(offer.stops, 0);
    assert.equal(offer.durationMinutes, 435);
    assert.equal(offer.price.amount, 425);
    assert.equal(offer.price.currency, "USD");
    assert.equal(offer.price.isEstimate, true);
    assert.equal(offer.slices.length, 1);
    assert.equal(offer.bookingToken, "CjRI-test-token");
    assert.match(offer.deepLinkUrl ?? "", /travel\/flights\/booking/);
    assert.match(offer.deepLinkUrl ?? "", /tfu=/);
  });

  it("marks connecting flights as transit", () => {
    const connecting: GoogleFlightsItinerary = {
      ...sample,
      segments: [
        sample.segments[0]!,
        {
          from: { code: "KIX", name: "Kansai" },
          to: { code: "HND", name: "Haneda" },
          departureAt: "2026-11-15T21:00:00",
          arrivalAt: "2026-11-15T22:10:00",
          durationMinutes: 70,
          flightNumber: "NH25",
          airlineCode: "NH",
          airlineName: "ANA",
          aircraft: null,
        },
      ],
    };
    const offer = mapGoogleFlightsOffer(
      connecting,
      { origin: "CGK", destination: "HND", departureDate: "2026-11-15" },
      "google",
      { currency: "IDR" },
    );
    assert.equal(offer.stops, 1);
    assert.equal(offer.transit, "transit");
    assert.equal(offer.destination, "HND");
    assert.equal(offer.price.currency, "IDR");
  });

  it("builds deep link with return date", () => {
    const url = buildDeepLink(
      {
        origin: "cgk",
        destination: "kix",
        departureDate: "2026-11-15",
        returnDate: "2026-11-25",
      },
      "usd",
      "id",
    );
    assert.match(url, /hl=id/);
    assert.match(url, /curr=USD/);
    assert.match(url, /through/);
  });
});
