import type { CacheStore } from "./types.js";

/** Always miss — used when caching is disabled. */
export class NoopCacheStore implements CacheStore {
  readonly name = "noop";

  async get(): Promise<string | null> {
    return null;
  }

  async set(): Promise<void> {}
}

/** Process-local Map with TTL — tests / fallback without Redis. */
export class MemoryCacheStore implements CacheStore {
  readonly name = "memory";
  private readonly data = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const row = this.data.get(key);
    if (!row) return null;
    if (row.expiresAt <= Date.now()) {
      this.data.delete(key);
      return null;
    }
    return row.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.data.set(key, {
      value,
      expiresAt: Date.now() + Math.max(1, ttlSeconds) * 1000,
    });
  }

  async del(key: string): Promise<void> {
    this.data.delete(key);
  }
}
