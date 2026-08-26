import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFakeMcpServer, parseToolPayload } from "../test/helpers.js";
import { registerPlacesTools } from "./server.js";

describe("registerPlacesTools", () => {
  it("covers restaurants, pois, places, and errors", async () => {
    const fake = createFakeMcpServer();
    let fail = false;
    await registerPlacesTools(fake.server, async (rel) => {
      if (rel.includes("config/env")) return { loadEnv: () => ({}) };
      return {
        createPlaceModule: () => ({
          service: {
            providerName: "mock",
            searchRestaurants: async (city: string) => {
              if (fail) throw new Error("r");
              return [{ city }];
            },
            searchPois: async (city: string) => {
              if (fail) throw new Error("p");
              return [{ city, poi: true }];
            },
            search: async (q: { textQuery: string }) => {
              if (fail) throw new Error("s");
              return [{ q: q.textQuery }];
            },
          },
        }),
      };
    });

    assert.equal(fake.tools.length, 3);
    assert.equal(
      parseToolPayload((await fake.call("search_restaurants", { city: "Osaka" })) as never).ok,
      true,
    );
    assert.equal(
      parseToolPayload((await fake.call("search_pois", { city: "Osaka" })) as never).ok,
      true,
    );
    assert.equal(
      parseToolPayload(
        (await fake.call("search_places", { textQuery: "cafe" })) as never,
      ).ok,
      true,
    );

    fail = true;
    assert.equal(
      parseToolPayload((await fake.call("search_restaurants", { city: "X" })) as never).ok,
      false,
    );
    assert.equal(
      parseToolPayload((await fake.call("search_pois", { city: "X" })) as never).ok,
      false,
    );
    assert.equal(
      parseToolPayload((await fake.call("search_places", { textQuery: "x" })) as never).ok,
      false,
    );
  });
});
