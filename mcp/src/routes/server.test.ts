import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFakeMcpServer, parseToolPayload } from "../test/helpers.js";
import { registerRoutesTools } from "./server.js";

describe("registerRoutesTools", () => {
  it("get_route success and error", async () => {
    const fake = createFakeMcpServer();
    let fail = false;
    await registerRoutesTools(fake.server, async (rel) => {
      if (rel.includes("config/env")) return { loadEnv: () => ({}) };
      return {
        createRouteModule: () => ({
          service: {
            providerName: "mock",
            getRoute: async () => {
              if (fail) throw new Error("route fail");
              return { durationMinutes: 42 };
            },
          },
        }),
      };
    });

    const ok = parseToolPayload(
      (await fake.call("get_route", {
        originLat: 1,
        originLng: 2,
        destinationLat: 3,
        destinationLng: 4,
      })) as never,
    );
    assert.equal(ok.ok, true);

    fail = true;
    const err = parseToolPayload(
      (await fake.call("get_route", {
        originLat: 1,
        originLng: 2,
        destinationLat: 3,
        destinationLng: 4,
      })) as never,
    );
    assert.equal(err.ok, false);
  });
});
