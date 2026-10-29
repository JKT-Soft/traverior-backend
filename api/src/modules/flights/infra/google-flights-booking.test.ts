import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mergeProviderOptions,
  parseBookingOptions,
} from "./google-flights-booking.js";
import type { FlightBookingOption } from "../domain/ports.js";

describe("parseBookingOptions", () => {
  it("extracts airline-direct and OTA vendor rows", () => {
    const payload = [
      null,
      [
        [
          0,
          [["GA", "Garuda Indonesia", null, true]],
          null,
          [["GA", "882"]],
          null,
          [
            "https://www.garuda-indonesia.com/book",
            null,
            ["https://www.google.com/travel/clk/f?u=ga"],
          ],
          null,
          [[null, 420], "token"],
          null,
          null,
          null,
          null,
          null,
          null,
          [[[null, ["GA", "ECO"], 1]]],
          null,
          null,
          null,
          null,
          null,
          null,
          [null, null, null, "Economy"],
        ],
        [
          1,
          [["CTRIP", "Trip.com", null, false]],
          null,
          [["GA", "882"]],
          null,
          [
            null,
            null,
            ["https://www.google.com/travel/clk/f?u=trip"],
          ],
          null,
          [[null, 435], "token"],
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          [null, null, null, "Standard"],
        ],
      ],
    ];

    const options = parseBookingOptions(payload, "USD");
    assert.equal(options.length, 2);

    assert.equal(options[0]?.agency, "Garuda Indonesia");
    assert.equal(options[0]?.agencyCode, "GA");
    assert.equal(options[0]?.isAirlineDirect, true);
    assert.equal(options[0]?.price.amount, 420);
    assert.equal(options[0]?.price.currency, "USD");
    assert.equal(options[0]?.fareName, "Economy");
    assert.equal(options[0]?.bookingUrl, "https://www.garuda-indonesia.com/book");

    assert.equal(options[1]?.agency, "Trip.com");
    assert.equal(options[1]?.agencyCode, "CTRIP");
    assert.equal(options[1]?.isAirlineDirect, false);
    assert.equal(options[1]?.price.amount, 435);
    assert.match(options[1]?.bookingUrl ?? "", /travel\/clk/);
    assert.equal(options[1]?.fareName, "Standard");
  });

  it("skips malformed rows", () => {
    const options = parseBookingOptions(
      [
        ["not-a-booking-row"],
        [0, "bad-vendor"],
        [0, [["X"]], null, null, null, null, null, [[null, 1]]],
      ],
      "IDR",
    );
    assert.deepEqual(options, []);
  });

  it("normalizes vendor hostnames and Google clk query params", () => {
    const payload = [
      [
        0,
        [["JT", "Lion", null, true]],
        null,
        null,
        null,
        [
          "www.lionair.co.id",
          null,
          [
            "https://www.google.com/travel/clk/f",
            [["u", "TOKEN123"]],
          ],
        ],
        null,
        [[null, 74], "tok"],
      ],
    ];
    const options = parseBookingOptions(payload, "USD");
    assert.equal(options.length, 1);
    assert.equal(options[0]?.bookingUrl, "https://www.lionair.co.id");
    assert.equal(options[0]?.price.amount, 74);
  });

  it("falls back to Google clk URL with u= when vendor host missing", () => {
    const payload = [
      [
        1,
        [["CTRIP", "Trip.com", null, false]],
        null,
        null,
        null,
        [
          null,
          null,
          ["https://www.google.com/travel/clk/f", [["u", "abc"]]],
        ],
        null,
        [[null, 99], "tok"],
      ],
    ];
    const options = parseBookingOptions(payload, "USD");
    assert.equal(options.length, 1);
    assert.equal(
      options[0]?.bookingUrl,
      "https://www.google.com/travel/clk/f?u=abc",
    );
  });
});

describe("mergeProviderOptions", () => {
  const opt = (
    agency: string,
    amount: number,
    bookingUrl: string,
    extra: Partial<FlightBookingOption> = {},
  ): FlightBookingOption => ({
    id: agency,
    agency,
    agencyCode: null,
    price: { amount, currency: "USD", isEstimate: true },
    bookingUrl,
    isAirlineDirect: false,
    fareName: null,
    logoUrl: null,
    ...extra,
  });

  it("keeps one card per agency, lowest price, prefers deep links", () => {
    const merged = mergeProviderOptions(
      [
        opt("Trip.com", 484, "https://www.trip.com/book", { agencyCode: "CTRIP" }),
        opt("Trip.com", 510, "https://www.trip.com/other"),
      ],
      [
        opt("Mytrip", 465, "https://www.google.com/travel/flights/booking?x=1"),
        opt("Trip.com", 490, "https://www.google.com/travel/flights/booking?x=1"),
        opt("Agoda", 508, "https://www.agoda.com/flights"),
      ],
    );
    assert.equal(merged.length, 3);
    assert.equal(merged[0]?.agency, "Mytrip");
    assert.equal(merged[0]?.price.amount, 465);
    assert.equal(merged.find((o) => o.agency === "Trip.com")?.bookingUrl, "https://www.trip.com/book");
    assert.equal(merged.find((o) => o.agency === "Agoda")?.price.amount, 508);
  });
});
