import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFakeMcpServer, parseToolPayload } from "../test/helpers.js";
import { registerHotelsTools } from "./server.js";

describe("registerHotelsTools", () => {
  it("search_hotels success and error", async () => {
    const fake = createFakeMcpServer();
    let fail = false;
    await registerHotelsTools(fake.server, async (rel) => {
      if (rel.includes("config/env")) return { loadEnv: () => ({}) };
      return {
        createHotelModule: () => ({
          service: {
            providerName: "mock",
            search: async (q: { cityName: string }) => {
              if (fail) throw new Error("hotel fail");
              return [{ name: q.cityName }];
            },
          },
        }),
      };
    });

    const ok = parseToolPayload(
      (await fake.call("search_hotels", {
        cityName: "Osaka",
        checkIn: "2026-10-01",
        checkOut: "2026-10-04",
      })) as never,
    );
    assert.equal(ok.ok, true);

    fail = true;
    const err = parseToolPayload(
      (await fake.call("search_hotels", {
        cityName: "Osaka",
        checkIn: "2026-10-01",
        checkOut: "2026-10-04",
      })) as never,
    );
    assert.equal(err.ok, false);
  });
});
