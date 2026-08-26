export interface CacheStore {
  readonly name: string;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del?(key: string): Promise<void>;
  quit?(): Promise<void>;
}

export type CacheAsideOptions = {
  cache?: CacheStore;
  /** Full redis/memory key */
  key: string;
  ttlSeconds: number;
};
