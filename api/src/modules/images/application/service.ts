import type { CacheStore } from "../../../shared/cache/index.js";
import { cacheKey, getOrSet } from "../../../shared/cache/index.js";
import type { ImageProvider, LocationImageQuery } from "../domain/ports.js";

export type ImageServiceOptions = {
  cache?: CacheStore;
  ttlSeconds?: number;
};

export class ImageService {
  private readonly cache?: CacheStore;
  private readonly ttlSeconds: number;

  constructor(
    private readonly provider: ImageProvider,
    options: ImageServiceOptions = {},
  ) {
    this.cache = options.cache;
    this.ttlSeconds = options.ttlSeconds ?? 604_800; // 7 days
  }

  search(query: LocationImageQuery) {
    return getOrSet(
      {
        cache: this.cache,
        key: cacheKey("images:search", { provider: this.provider.name, query }),
        ttlSeconds: this.ttlSeconds,
      },
      () => this.provider.searchImages(query),
    );
  }

  /** Convenience: travel-oriented search for a city/location name. */
  searchByLocation(location: string, options: Omit<LocationImageQuery, "query"> = {}) {
    const query = `${location} travel landmark`;
    return this.search({
      query,
      perPage: options.perPage ?? 5,
      orientation: options.orientation ?? "landscape",
    });
  }

  async getLocationThumbnail(location: string): Promise<string | null> {
    const images = await this.searchByLocation(location, { perPage: 1 });
    return images[0]?.thumbUrl || images[0]?.imageUrl || null;
  }

  get providerName() {
    return this.provider.name;
  }
}
