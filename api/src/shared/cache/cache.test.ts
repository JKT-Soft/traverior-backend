import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cacheKey, getOrSet } from "./cache-aside.js";
import { MemoryCacheStore, NoopCacheStore } from "./memory-store.js";

describe("cacheKey", () => {
  it("is stable for same payload and differs for different payload", () => {
    const a = cacheKey("flights:search", { origin: "CGK" });
    const b = cacheKey("flights:search", { origin: "CGK" });
    const c = cacheKey("flights:search", { origin: "DPS" });
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.match(a, /^traverior:flights:search:/);
  });
});

describe("MemoryCacheStore / NoopCacheStore", () => {
  it("memory get/set/ttl/del", async () => {
    const store = new MemoryCacheStore();
    assert.equal(store.name, "memory");
    assert.equal(await store.get("k"), null);
    await store.set("k", "v", 60);
    assert.equal(await store.get("k"), "v");
    await store.del("k");
    assert.equal(await store.get("k"), null);

    await store.set("exp", "x", 0); // clamped to 1s min in set via Math.max in redis; memory uses Math.max(1,ttl)
    assert.equal(await store.get("exp"), "x");
  });

  it("noop always misses", async () => {
    const store = new NoopCacheStore();
    await store.set("k", "v", 10);
    assert.equal(await store.get("k"), null);
  });
});

describe("getOrSet", () => {
  it("loads once then serves cache hit", async () => {
    const store = new MemoryCacheStore();
    let loads = 0;
    const loader = async () => {
      loads += 1;
      return { n: loads };
    };

    const a = await getOrSet(
      { cache: store, key: "t1", ttlSeconds: 60 },
      loader,
    );
    const b = await getOrSet(
      { cache: store, key: "t1", ttlSeconds: 60 },
      loader,
    );
    assert.deepEqual(a, { n: 1 });
    assert.deepEqual(b, { n: 1 });
    assert.equal(loads, 1);
  });

  it("skips cache when missing or ttl<=0", async () => {
    let loads = 0;
    const loader = async () => {
      loads += 1;
      return loads;
    };
    assert.equal(await getOrSet({ key: "x", ttlSeconds: 10 }, loader), 1);
    assert.equal(
      await getOrSet({ cache: new MemoryCacheStore(), key: "x", ttlSeconds: 0 }, loader),
      2,
    );
  });

  it("survives cache get/set failures", async () => {
    const broken: import("./types.js").CacheStore = {
      name: "broken",
      async get() {
        throw new Error("get boom");
      },
      async set() {
        throw new Error("set boom");
      },
    };
    const value = await getOrSet({ cache: broken, key: "k", ttlSeconds: 30 }, async () => 42);
    assert.equal(value, 42);
  });
});
