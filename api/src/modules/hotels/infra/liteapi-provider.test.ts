import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { loadEnv } from "../../../config/env.js";
import { baseEnv, stubFetch } from "../../../test/helpers.js";
import {
  createLiteApiHotelProvider,
  LiteApiHotelProvider,
} from "./liteapi-provider.js";

let restoreFetch: (() => void) | undefined;

afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});

describe("LiteApiHotelProvider", () => {
  it("createLiteApiHotelProvider requires key", () => {
    assert.throws(
      () => createLiteApiHotelProvider(loadEnv(baseEnv({ PROVIDER_HOTELS: "liteapi" }))),
      /LITEAPI/,
    );
    assert.equal(
      createLiteApiHotelProvider(
        loadEnv(baseEnv({ PROVIDER_HOTELS: "liteapi", LITEAPI_KEY: "k" })),
      ).name,
      "liteapi",
    );
  });

  it("error + success + optional fields + empty payload", async () => {
    const p = new LiteApiHotelProvider("k");

    restoreFetch = stubFetch(
      async () => ({ ok: false, status: 400, text: async () => "e" }) as Response,
    );
    await assert.rejects(
      () => p.searchHotels({ cityName: "Osaka", checkIn: "a", checkOut: "b" }),
      /LiteAPI/,
    );

    restoreFetch();
    restoreFetch = stubFetch(
      async () =>
        ({
          ok: true,
          json: async () => ({
            hotels: [
              {
                id: "h1",
                name: "H",
                stars: 4,
                address: "A",
                city_name: "Osaka",
                rating: 8.2,
                checkinCheckoutTimes: { checkin_start: "3:00 PM", checkout: "11:00 AM" },
              },
            ],
            data: [
              {
                hotelId: "h1",
                roomTypes: [
                  {
                    rates: [
                      {
                        boardType: "RO",
                        boardName: "Room Only",
                        retailRate: { total: [{ amount: 10, currency: "USD" }] },
                        cancellationPolicies: { refundableTag: "NRFN" },
                      },
                    ],
                  },
                ],
              },
              { hotelId: "missing" },
            ],
          }),
        }) as Response,
    );
    const hotels = await p.searchHotels({
      cityName: "Osaka",
      countryCode: "JP",
      checkIn: "2026-10-01",
      checkOut: "2026-10-02",
    });
    assert.equal(hotels[0]?.price.amount, 10);
    assert.equal(hotels[0]?.board.type, "RO");
    assert.equal(hotels[0]?.refundable, false);
    assert.equal(hotels[0]?.nights, 1);
    assert.equal(hotels[0]?.checkInTime, "15:00");
    assert.equal(hotels[1]?.price.isEstimate, true);

    restoreFetch();
    restoreFetch = stubFetch(
      async () =>
        ({
          ok: true,
          json: async () => ({
            hotels: undefined,
            data: [
              { hotelId: undefined, roomTypes: [] },
              {
                hotelId: "h2",
                roomTypes: [{ rates: [{ retailRate: { total: [] } }] }],
              },
            ],
          }),
        }) as Response,
    );
    const optional = await p.searchHotels({
      cityName: "Osaka",
      checkIn: "a",
      checkOut: "b",
    });
    assert.equal(optional[0]?.name, "Hotel");
    assert.equal(optional[0]?.price.amount, 0);
    assert.equal(optional[1]?.hotelId, "h2");

    restoreFetch();
    restoreFetch = stubFetch(
      async () => ({ ok: true, json: async () => ({}) }) as Response,
    );
    assert.deepEqual(
      await p.searchHotels({ cityName: "Osaka", checkIn: "a", checkOut: "b" }),
      [],
    );
  });
});
