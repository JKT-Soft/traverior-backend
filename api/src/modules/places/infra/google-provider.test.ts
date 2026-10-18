import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { loadEnv } from "../../../config/env.js";
import { baseEnv, stubFetch } from "../../../test/helpers.js";
import {
  createGooglePlaceProvider,
  GooglePlaceProvider,
} from "./google-provider.js";

let restoreFetch: (() => void) | undefined;

afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});

describe("GooglePlaceProvider", () => {
  it("createGooglePlaceProvider requires key", () => {
    assert.throws(
      () => createGooglePlaceProvider(loadEnv(baseEnv({ PROVIDER_PLACES: "google" }))),
      /GOOGLE/,
    );
    assert.equal(
      createGooglePlaceProvider(
        loadEnv(baseEnv({ PROVIDER_PLACES: "google", GOOGLE_MAPS_API_KEY: "k" })),
      ).name,
      "google_places",
    );
  });

  it("error + success + empty collections", async () => {
    const p = new GooglePlaceProvider("k");

    restoreFetch = stubFetch(
      async () => ({ ok: false, status: 403, text: async () => "no" }) as Response,
    );
    await assert.rejects(() => p.searchPlaces({ textQuery: "x" }), /Google Places/);

    restoreFetch();
    restoreFetch = stubFetch(async (input) => {
      const url = String(input);
      if (url.includes("/media")) {
        return {
          ok: true,
          json: async () => ({ photoUri: "https://lh3.googleusercontent.com/p1.jpg" }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          places: [
            {
              id: "p1",
              displayName: { text: "R" },
              formattedAddress: "A",
              location: { latitude: 1, longitude: 2 },
              rating: 4,
              types: ["restaurant"],
              photos: [{ name: "places/p1/photos/abc" }],
            },
            {},
          ],
        }),
      } as Response;
    });
    const places = await p.searchPlaces({ textQuery: "food", maxResultCount: 2 });
    assert.equal(places[0]?.placeId, "p1");
    assert.equal(places[0]?.thumbnailUrl, "https://lh3.googleusercontent.com/p1.jpg");
    assert.equal(places[1]?.name, "Place");
    assert.equal(places[1]?.thumbnailUrl, null);

    restoreFetch();
    restoreFetch = stubFetch(
      async () => ({ ok: true, json: async () => ({}) }) as Response,
    );
    assert.deepEqual(await p.searchPlaces({ textQuery: "x" }), []);
  });
});
