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
            hotels: [{ id: "h1", name: "H", starRating: 4, address: "A" }],
            data: [
              {
                hotelId: "h1",
                roomTypes: [
                  { rates: [{ retailRate: { total: [{ amount: 10, currency: "USD" }] } }] },
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
