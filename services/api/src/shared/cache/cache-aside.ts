import { createHash } from "node:crypto";
import type { CacheAsideOptions, CacheStore } from "./types.js";

export function cacheKey(namespace: string, parts: unknown): string {
  const hash = createHash("sha256")
    .update(JSON.stringify(parts))
    .digest("hex")
    .slice(0, 24);
  return `traverior:${namespace}:${hash}`;
}

/**
 * Cache-aside: return cached JSON value or load, store, then return.
 * Cache failures never block the provider call.
 */
export async function getOrSet<T>(
  options: CacheAsideOptions,
  loader: () => Promise<T>,
): Promise<T> {
  const { cache, key, ttlSeconds } = options;
  if (!cache || ttlSeconds <= 0) return loader();

  try {
    const hit = await cache.get(key);
    if (hit != null) return JSON.parse(hit) as T;
  } catch (err) {
    console.warn("[traverior-api:cache] get failed", { key, err: String(err) });
  }

  const value = await loader();

  try {
    await cache.set(key, JSON.stringify(value), ttlSeconds);
  } catch (err) {
    console.warn("[traverior-api:cache] set failed", { key, err: String(err) });
  }

  return value;
}

export type { CacheStore, CacheAsideOptions };
