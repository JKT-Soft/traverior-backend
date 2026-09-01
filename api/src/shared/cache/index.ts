import type { Env } from "../../config/env.js";
import { MemoryCacheStore, NoopCacheStore } from "./memory-store.js";
import { RedisCacheStore } from "./redis-store.js";
import type { CacheStore } from "./types.js";

export async function createCacheStore(env: Env): Promise<CacheStore> {
  if (!env.cache.enabled) {
    return new NoopCacheStore();
  }

  if (!env.cache.redisUrl) {
    console.warn(
      "[traverior-api:cache] CACHE_ENABLED=true but REDIS_URL missing — using in-memory cache",
    );
    return new MemoryCacheStore();
  }

  try {
    const store = await RedisCacheStore.connect(env.cache.redisUrl);
    console.log(`[traverior-api:cache] redis connected (${env.cache.redisUrl})`);
    return store;
  } catch (err) {
    console.warn(
      "[traverior-api:cache] redis connect failed — falling back to memory",
      String(err),
    );
    return new MemoryCacheStore();
  }
}

export { cacheKey, getOrSet } from "./cache-aside.js";
export { MemoryCacheStore, NoopCacheStore } from "./memory-store.js";
export { RedisCacheStore } from "./redis-store.js";
export type { CacheStore } from "./types.js";
