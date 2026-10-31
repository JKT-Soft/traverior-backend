import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mapLiteApiHotel,
  nightsBetween,
  parseHotelTime,
  refundableFromTag,
} from "./map-liteapi-hotel.js";

const query = {
  cityName: "Osaka",
  countryCode: "JP",
  checkIn: "2026-10-01",
  checkOut: "2026-10-02",
  currency: "IDR" as const,
};

describe("map-liteapi-hotel helpers", () => {
  it("computes nights and normalizes times", () => {
    assert.equal(nightsBetween("2026-10-01", "2026-10-02"), 1);
    assert.equal(nightsBetween("2026-10-01", "2026-10-08"), 7);
    assert.equal(nightsBetween("a", "b"), 0);
    assert.equal(nightsBetween("2026-10-02", "2026-10-01"), 0);
    assert.equal(parseHotelTime("15:00"), "15:00");
    assert.equal(parseHotelTime("4:00 PM"), "16:00");
    assert.equal(parseHotelTime("11:00 AM"), "11:00");
    assert.equal(parseHotelTime("12:00 AM"), "00:00");
    assert.equal(parseHotelTime("12:00 PM"), "12:00");
    assert.equal(parseHotelTime("  "), null);
    assert.equal(parseHotelTime(undefined), null);
    assert.equal(parseHotelTime("noon"), "noon");
  });

  it("maps refundable tags", () => {
    assert.equal(refundableFromTag("RFN"), true);
    assert.equal(refundableFromTag("nrfn"), false);
    assert.equal(refundableFromTag("maybe"), null);
    assert.equal(refundableFromTag(undefined), null);
  });
});

describe("mapLiteApiHotel", () => {
  it("maps stay fields from rates plus hotel meta", () => {
    const offer = mapLiteApiHotel(
      {
        hotelId: "lp-osaka",
        roomTypes: [
          {
            rates: [
              {
                boardType: "BB",
                boardName: "Breakfast Included",
                retailRate: { total: [{ amount: 2_450_000, currency: "IDR" }] },
                cancellationPolicies: { refundableTag: "RFN" },
              },
            ],
          },
        ],
      },
      {
        id: "lp-osaka",
        name: "Osaka Central Hotel",
        address: "Chuo, Osaka",
        city_name: "Osaka",
        country_code: "JP",
        latitude: 34.6937,
        longitude: 135.5023,
        stars: 4,
        rating: 8.6,
        review_count: 120,
        checkinCheckoutTimes: { checkin_start: "03:00 PM", checkout: "11:00 AM" },
        main_photo: "https://cdn.liteapi.travel/hotels/osaka.jpg",
      },
      query,
      "liteapi",
    );

    assert.equal(offer.name, "Osaka Central Hotel");
    assert.equal(offer.location.city, "Osaka");
    assert.equal(offer.location.address, "Chuo, Osaka");
    assert.equal(offer.stars, 4);
    assert.equal(offer.rating, 8.6);
    assert.equal(offer.checkInTime, "15:00");
    assert.equal(offer.checkOutTime, "11:00");
    assert.equal(offer.nights, 1);
    assert.deepEqual(offer.board, { type: "BB", name: "Breakfast Included" });
    assert.equal(offer.refundable, true);
    assert.equal(offer.thumbnailUrl, "https://cdn.liteapi.travel/hotels/osaka.jpg");
    assert.equal(offer.price.isEstimate, false);
    assert.ok(offer.deepLinkUrl?.includes("google.com/travel/hotels"));
    assert.ok(offer.deepLinkUrl?.includes("Osaka"));
  });

  it("falls back when rate and meta are sparse", () => {
    const sparse = mapLiteApiHotel(
      {
        hotelId: "h2",
        roomTypes: [{ offerRetailRate: { amount: 99, currency: "USD" }, rates: [{}] }],
      },
      { id: "h2", starRating: 3, city: "Kyoto", countryCode: "JP" },
      { cityName: "Kyoto", checkIn: "a", checkOut: "b" },
      "liteapi",
    );
    assert.equal(sparse.name, "h2");
    assert.equal(sparse.stars, 3);
    assert.equal(sparse.location.city, "Kyoto");
    assert.equal(sparse.nights, 0);
    assert.equal(sparse.refundable, null);
    assert.equal(sparse.price.amount, 99);
    assert.equal(sparse.price.isEstimate, false);

    const empty = mapLiteApiHotel({}, undefined, query, "liteapi");
    assert.equal(empty.hotelId, "unknown");
    assert.equal(empty.name, "Hotel");
    assert.equal(empty.price.isEstimate, true);
    assert.equal(empty.stars, null);
    assert.equal(empty.thumbnailUrl, null);
  });
});
