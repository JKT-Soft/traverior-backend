import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  flightSearchDeepLink,
  hotelSearchDeepLink,
  resolveOfferDeepLink,
  textUrl,
} from "./deep-link.js";

describe("deep-link helpers", () => {
  it("picks the first absolute http(s) URL", () => {
    assert.equal(textUrl(undefined, "not-a-url", "https://a.example/x"), "https://a.example/x");
    assert.equal(textUrl("http://b.example"), "http://b.example");
    assert.equal(textUrl("  "), undefined);
  });

  it("builds Google Flights and Hotels search links", () => {
    assert.match(
      flightSearchDeepLink({
        origin: "CGK",
        destination: "KIX",
        departureDate: "2026-10-01T08:00:00Z",
        returnDate: "2026-10-08",
      }),
      /^https:\/\/www\.google\.com\/travel\/flights\?q=/,
    );
    assert.match(
      hotelSearchDeepLink({
        name: "Osaka Central",
        city: "Osaka",
        checkIn: "2026-10-01",
        checkOut: "2026-10-08",
      }),
      /^https:\/\/www\.google\.com\/travel\/hotels\?/,
    );
  });

  it("prefers provider deepLinkUrl over synthesis", () => {
    assert.equal(
      resolveOfferDeepLink("flight", {
        deepLinkUrl: "https://provider.example/offer",
        origin: "CGK",
        destination: "KIX",
        departureAt: "2026-10-01T08:00:00Z",
      }),
      "https://provider.example/offer",
    );
  });

  it("synthesizes flight and hotel links when missing", () => {
    const flight = resolveOfferDeepLink("flight", {
      origin: "CGK",
      destination: "KIX",
      departureAt: "2026-10-01T08:00:00Z",
    });
    assert.ok(flight?.includes("google.com/travel/flights"));

    const hotel = resolveOfferDeepLink("hotel", {
      name: "Hotel A",
      city: "Osaka",
      checkIn: "2026-10-01",
      checkOut: "2026-10-03",
    });
    assert.ok(hotel?.includes("google.com/travel/hotels"));
  });

  it("reads event deepLinkUrl / url fields", () => {
    assert.equal(
      resolveOfferDeepLink("event", { deepLinkUrl: "https://eventbrite.com/e/1" }),
      "https://eventbrite.com/e/1",
    );
    assert.equal(
      resolveOfferDeepLink("event", { url: "https://eventbrite.com/e/2" }),
      "https://eventbrite.com/e/2",
    );
  });
});
