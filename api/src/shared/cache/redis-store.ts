import { createClient, type RedisClientType } from "redis";
import type { CacheStore } from "./types.js";

export class RedisCacheStore implements CacheStore {
  readonly name = "redis";

  private constructor(private readonly client: RedisClientType) {}

  static async connect(url: string): Promise<RedisCacheStore> {
    const client = createClient({
      url,
      socket: {
        connectTimeout: 5_000,
        // Cap retries so a dead REDIS_URL fails fast (tests + boot fallback).
        reconnectStrategy(retries) {
          if (retries >= 3) return false;
          return Math.min(retries * 100, 500);
        },
      },
    });
    client.on("error", (err) => {
      console.error("[traverior-api:redis]", err);
    });
    try {
      await client.connect();
    } catch (err) {
      client.removeAllListeners();
      try {
        await client.disconnect();
      } catch {
        /* ignore cleanup errors */
      }
      throw err;
    }
    return new RedisCacheStore(client as RedisClientType);
  }

  async get(key: string): Promise<string | null> {
    const value = await this.client.get(key);
    return value ?? null;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, { EX: Math.max(1, ttlSeconds) });
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async quit(): Promise<void> {
    await this.client.quit();
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }
}
