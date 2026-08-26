import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFakeMcpServer, parseToolPayload } from "../test/helpers.js";
import { registerFlightsTools } from "./server.js";

describe("registerFlightsTools", () => {
  it("search_flights and get_offer success + error paths", async () => {
    const fake = createFakeMcpServer();
    let fail = false;
    await registerFlightsTools(fake.server, async (rel) => {
      if (rel.includes("config/env")) return { loadEnv: () => ({}) };
      return {
        createFlightModule: () => ({
          service: {
            providerName: "mock",
            search: async (q: { origin: string }) => {
              if (fail) throw new Error("search failed");
              return [{ origin: q.origin }];
            },
            getOffer: async (id: string) => {
              if (fail) throw "offer boom";
              return { id };
            },
          },
        }),
      };
    });

    assert.deepEqual(
      fake.tools.map((t) => t.name).sort(),
      ["get_offer", "search_flights"],
    );

    const search = parseToolPayload(
      (await fake.call("search_flights", {
        origin: "CGK",
        destination: "KIX",
        departureDate: "2026-10-01",
      })) as never,
    );
    assert.equal(search.ok, true);
    assert.equal((search.data as { provider: string }).provider, "mock");

    const offer = parseToolPayload(
      (await fake.call("get_offer", { offerId: "mock-1" })) as never,
    );
    assert.equal((offer.data as { offer: { id: string } }).offer.id, "mock-1");

    fail = true;
    const searchErr = parseToolPayload(
      (await fake.call("search_flights", {
        origin: "CGK",
        destination: "KIX",
        departureDate: "2026-10-01",
      })) as never,
    );
    assert.equal(searchErr.ok, false);
    assert.match(searchErr.error ?? "", /search failed/);

    const offerErr = parseToolPayload(
      (await fake.call("get_offer", { offerId: "x" })) as never,
    );
    assert.equal(offerErr.ok, false);
    assert.equal(offerErr.error, "offer boom");
  });
});
