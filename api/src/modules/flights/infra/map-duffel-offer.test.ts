import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatCabinLabel,
  mapBaggage,
  mapDuffelOffer,
  parseIsoDurationMinutes,
  sliceStops,
  transitFromStops,
} from "./map-duffel-offer.js";

const query = {
  origin: "CGK",
  destination: "KIX",
  departureDate: "2026-10-01",
  returnDate: "2026-10-08",
  cabinClass: "economy" as const,
};

describe("map-duffel-offer helpers", () => {
  it("parses ISO durations and cabin labels", () => {
    assert.equal(parseIsoDurationMinutes("PT7H25M"), 445);
    assert.equal(parseIsoDurationMinutes("PT2H"), 120);
    assert.equal(parseIsoDurationMinutes("PT45M"), 45);
    assert.equal(parseIsoDurationMinutes("PT"), 0);
    assert.equal(parseIsoDurationMinutes("nope"), 0);
    assert.equal(parseIsoDurationMinutes(undefined), 0);
    assert.equal(formatCabinLabel("premium_economy"), "Premium Economy");
    assert.equal(formatCabinLabel("economy"), "Economy");
  });

  it("maps baggage, stops, and transit", () => {
    assert.deepEqual(
      mapBaggage([
        { type: "checked", quantity: 1 },
        { type: "carry_on" },
        { type: "unknown", quantity: 9 },
      ]),
      [
        { type: "checked", quantity: 1 },
        { type: "carry_on", quantity: 0 },
      ],
    );
    assert.deepEqual(mapBaggage(undefined), []);
    assert.equal(sliceStops([{ stops: [{}, {}] }, { stops: [] }]), 3);
    assert.equal(sliceStops([]), 0);
    assert.equal(transitFromStops(0), "direct");
    assert.equal(transitFromStops(1), "transit");
  });
});

describe("mapDuffelOffer", () => {
  it("summarizes the outbound slice including connecting segments", () => {
    const offer = mapDuffelOffer(
      {
        id: "off_connect",
        total_amount: "4100000",
        total_currency: "IDR",
        slices: [
          {
            duration: "PT10H15M",
            origin: { iata_code: "CGK", name: "Soekarno-Hatta", city_name: "Jakarta" },
            destination: { iata_code: "KIX", name: "Kansai", city_name: "Osaka" },
            segments: [
              {
                operating_carrier: { iata_code: "GA", name: "Garuda Indonesia" },
                operating_carrier_flight_number: "868",
                departing_at: "2026-10-01T08:15:00",
                arriving_at: "2026-10-01T11:10:00",
                duration: "PT1H55M",
                origin: { iata_code: "CGK", name: "Soekarno-Hatta", city_name: "Jakarta" },
                destination: { iata_code: "SIN", name: "Changi", city_name: "Singapore" },
                origin_terminal: "3",
                destination_terminal: "1",
                passengers: [
                  {
                    cabin_class: "economy",
                    cabin_class_marketing_name: "Economy",
                    baggages: [{ type: "checked", quantity: 1 }],
                  },
                ],
              },
              {
                operating_carrier: { iata_code: "SQ", name: "Singapore Airlines" },
                operating_carrier_flight_number: "622",
                departing_at: "2026-10-01T13:00:00",
                arriving_at: "2026-10-01T20:30:00",
                duration: "PT6H30M",
                origin: { iata_code: "SIN", name: "Changi", city_name: "Singapore" },
                destination: { iata_code: "KIX", name: "Kansai", city_name: "Osaka" },
                origin_terminal: "3",
                destination_terminal: "1",
                passengers: [
                  {
                    cabin_class: "economy",
                    cabin_class_marketing_name: "Economy",
                    baggages: [{ type: "checked", quantity: 1 }],
                  },
                ],
              },
            ],
          },
        ],
      },
      query,
      "duffel",
    );

    assert.equal(offer.providerRef, "off_connect");
    assert.equal(offer.airline.name, "Garuda Indonesia");
    assert.equal(offer.airline.iataCode, "GA");
    assert.equal(offer.carrier, "Garuda Indonesia");
    assert.equal(offer.flightNumber, "868");
    assert.equal(offer.origin, "CGK");
    assert.equal(offer.destination, "KIX");
    assert.equal(offer.originAirport.name, "Soekarno-Hatta");
    assert.equal(offer.originAirport.terminal, "3");
    assert.equal(offer.destinationAirport.name, "Kansai");
    assert.equal(offer.destinationAirport.terminal, "1");
    assert.equal(offer.departureAt, "2026-10-01T08:15:00");
    assert.equal(offer.arrivalAt, "2026-10-01T20:30:00");
    assert.equal(offer.cabin, "economy");
    assert.equal(offer.cabinLabel, "Economy");
    assert.equal(offer.durationMinutes, 615);
    assert.equal(offer.transit, "transit");
    assert.equal(offer.stops, 1);
    assert.deepEqual(offer.baggage, [{ type: "checked", quantity: 1 }]);
    assert.equal(offer.price.amount, 4_100_000);
    assert.equal(offer.price.isEstimate, false);
    assert.equal(offer.slices[0]?.segments.length, 2);
    assert.ok(offer.deepLinkUrl?.includes("google.com/travel/flights"));
    assert.ok(offer.deepLinkUrl?.includes("CGK"));
    assert.ok(offer.deepLinkUrl?.includes("KIX"));
  });

  it("falls back when slices and carriers are sparse", () => {
    const empty = mapDuffelOffer(
      { id: "off_empty", total_amount: "1", total_currency: "USD", slices: [] },
      query,
      "duffel",
    );
    assert.equal(empty.origin, "CGK");
    assert.equal(empty.destination, "KIX");
    assert.equal(empty.carrier, "Unknown");
    assert.equal(empty.transit, "direct");
    assert.equal(empty.slices.length, 1);
    assert.equal(empty.slices[0]?.segments.length, 0);

    const named = mapDuffelOffer(
      {
        id: "off_name",
        total_amount: "90",
        total_currency: "USD",
        slices: [
          {
            duration: "nope",
            segments: [
              {
                operating_carrier: { name: "X" },
                marketing_carrier_flight_number: "12",
                origin: { iata_code: "A" },
                destination: { iata_code: "B" },
                departing_at: "t",
                arriving_at: "t2",
                duration: "PT1H",
                origin_terminal: "  ",
                passengers: [{ cabin_class: "business" }],
              },
            ],
          },
        ],
      },
      { origin: "AAA", destination: "BBB", departureDate: "2026-01-01" },
      "duffel",
    );
    assert.equal(named.airline.name, "X");
    assert.equal(named.airline.iataCode, null);
    assert.equal(named.flightNumber, "12");
    assert.equal(named.cabin, "business");
    assert.equal(named.cabinLabel, "Business");
    assert.equal(named.durationMinutes, 60);
    assert.equal(named.originAirport.terminal, null);

    const inbound = mapDuffelOffer(
      {
        id: "off_rt",
        total_amount: "2",
        total_currency: "USD",
        slices: [
          { segments: [{ origin: { iata_code: "CGK" }, destination: { iata_code: "KIX" }, departing_at: "a", arriving_at: "b" }] },
          { segments: [{ origin: { iata_code: "KIX" }, destination: { iata_code: "CGK" }, departing_at: "c", arriving_at: "d" }] },
        ],
      },
      query,
      "duffel",
    );
    assert.equal(inbound.slices[1]?.origin.code, "KIX");
    assert.equal(inbound.slices[1]?.destination.code, "CGK");
  });
});
