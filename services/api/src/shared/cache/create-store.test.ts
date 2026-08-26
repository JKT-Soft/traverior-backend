import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Env } from "../../config/env.js";
import { createCacheStore } from "./index.js";
import { MemoryCacheStore, NoopCacheStore } from "./memory-store.js";

function envWith(cache: Partial<Env["cache"]>): Env {
  return {
    port: 3000,
    nodeEnv: "test",
    authMode: "dev",
    databaseUrl: "postgresql://x",
    logDir: "logs",
    logLevel: "info",
    openaiApiKey: undefined,
    llm: {
      provider: "heuristic",
      model: "gpt-4o-mini",
    },
    cache: {
      enabled: true,
      ttl: {
        flights: 1,
        hotels: 1,
        places: 1,
        routes: 1,
        weather: 1,
        events: 1,
        visa: 1,
        trips: 1,
      },
      ...cache,
    },
    providers: {
      flights: "mock",
      hotels: "mock",
      places: "mock",
      routes: "mock",
      weather: "mock",
      events: "mock",
      visa: "static",
    },
    secrets: {},
  };
}

describe("createCacheStore", () => {
  it("returns noop when disabled", async () => {
    const store = await createCacheStore(envWith({ enabled: false }));
    assert.ok(store instanceof NoopCacheStore);
  });

  it("returns memory when enabled without redis url", async () => {
    const store = await createCacheStore(envWith({ enabled: true, redisUrl: undefined }));
    assert.ok(store instanceof MemoryCacheStore);
  });

  it("falls back to memory when redis connect fails", async () => {
    const store = await createCacheStore(
      envWith({ enabled: true, redisUrl: "redis://127.0.0.1:1" }),
    );
    assert.ok(store instanceof MemoryCacheStore);
  });
});
