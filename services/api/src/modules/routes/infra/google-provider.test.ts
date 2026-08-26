import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { loadEnv } from "../../../config/env.js";
import { baseEnv, stubFetch } from "../../../test/helpers.js";
import {
  createGoogleRouteProvider,
  GoogleRouteProvider,
} from "./google-provider.js";

let restoreFetch: (() => void) | undefined;

afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});

describe("GoogleRouteProvider", () => {
  it("createGoogleRouteProvider requires key", () => {
    assert.throws(
      () => createGoogleRouteProvider(loadEnv(baseEnv({ PROVIDER_ROUTES: "google" }))),
      /GOOGLE/,
    );
    assert.equal(
      createGoogleRouteProvider(
        loadEnv(baseEnv({ PROVIDER_ROUTES: "google", GOOGLE_MAPS_API_KEY: "k" })),
      ).name,
      "google_routes",
    );
  });

  it("error + success + empty + bad duration", async () => {
    const p = new GoogleRouteProvider("k");

    restoreFetch = stubFetch(
      async () => ({ ok: false, status: 500, text: async () => "e" }) as Response,
    );
    await assert.rejects(
      () =>
        p.getRoute({
          originLat: 1,
          originLng: 2,
          destinationLat: 3,
          destinationLng: 4,
        }),
      /Google Routes/,
    );

    restoreFetch();
    restoreFetch = stubFetch(
      async () =>
        ({
          ok: true,
          json: async () => ({
            routes: [
              {
                duration: "120s",
                distanceMeters: 500,
                legs: [
                  {
                    steps: [
                      { navigationInstruction: { instructions: "Go" } },
                      { navigationInstruction: {} },
                    ],
                  },
                ],
              },
            ],
          }),
        }) as Response,
    );
    const r = await p.getRoute({
      originLat: 1,
      originLng: 2,
      destinationLat: 3,
      destinationLng: 4,
    });
    assert.equal(r.durationMinutes, 2);
    assert.deepEqual(r.stepsSummary, ["Go"]);

    restoreFetch();
    restoreFetch = stubFetch(
      async () => ({ ok: true, json: async () => ({ routes: [] }) }) as Response,
    );
    const empty = await p.getRoute({
      originLat: 1,
      originLng: 2,
      destinationLat: 3,
      destinationLng: 4,
    });
    assert.equal(empty.distanceMeters, 0);

    restoreFetch();
    restoreFetch = stubFetch(
      async () =>
        ({
          ok: true,
          json: async () => ({
            routes: [{ duration: "bad", legs: [{ steps: [{}] }] }],
          }),
        }) as Response,
    );
    const bad = await p.getRoute({
      originLat: 1,
      originLng: 2,
      destinationLat: 3,
      destinationLng: 4,
    });
    assert.equal(bad.mode, "TRANSIT");
    assert.equal(bad.durationMinutes, 0);
  });
});
