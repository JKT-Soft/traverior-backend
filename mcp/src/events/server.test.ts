import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFakeMcpServer, parseToolPayload } from "../test/helpers.js";
import { registerEventsTools } from "./server.js";

describe("registerEventsTools", () => {
  it("search_events, search_tours, and errors", async () => {
    const fake = createFakeMcpServer();
    let fail = false;
    const calls: unknown[] = [];
    await registerEventsTools(fake.server, async (rel) => {
      if (rel.includes("config/env")) return { loadEnv: () => ({}) };
      return {
        createEventModule: () => ({
          service: {
            providerName: "mock",
            search: async (q: unknown) => {
              calls.push(q);
              if (fail) throw new Error("events");
              return [{ id: 1 }];
            },
          },
        }),
      };
    });

    assert.equal(
      parseToolPayload((await fake.call("search_events", { city: "Osaka" })) as never).ok,
      true,
    );
    assert.equal(
      parseToolPayload((await fake.call("search_tours", { city: "Osaka" })) as never).ok,
      true,
    );
    assert.deepEqual(calls[1], {
      city: "Osaka",
      includeFree: false,
      includePaid: true,
    });

    fail = true;
    assert.equal(
      parseToolPayload((await fake.call("search_events", { city: "X" })) as never).ok,
      false,
    );
    assert.equal(
      parseToolPayload((await fake.call("search_tours", { city: "X" })) as never).ok,
      false,
    );
  });
});
