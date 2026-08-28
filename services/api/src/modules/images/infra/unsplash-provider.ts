import type { Env } from "../../../config/env.js";
import { AppError } from "../../../shared/http/errors.js";
import type { ImageProvider, LocationImage, LocationImageQuery } from "../domain/ports.js";

type UnsplashSearchResponse = {
  results?: Array<{
    id: string;
    description?: string | null;
    alt_description?: string | null;
    width: number;
    height: number;
    color?: string | null;
    urls?: {
      raw?: string;
      full?: string;
      regular?: string;
      small?: string;
      thumb?: string;
    };
    links?: {
      html?: string;
      download_location?: string;
    };
    user?: {
      name?: string;
      links?: { html?: string };
    };
  }>;
};

export function createUnsplashImageProvider(env: Env): ImageProvider {
  const accessKey = env.secrets.unsplashAccessKey;
  if (!accessKey) {
    throw new Error("UNSPLASH_ACCESS_KEY is required when PROVIDER_IMAGES=unsplash");
  }
  return new UnsplashImageProvider(accessKey);
}

export class UnsplashImageProvider implements ImageProvider {
  readonly name = "unsplash";

  constructor(
    private readonly accessKey: string,
    private readonly fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args),
  ) {}

  async searchImages(query: LocationImageQuery): Promise<LocationImage[]> {
    const params = new URLSearchParams({
      query: query.query,
      per_page: String(Math.min(Math.max(query.perPage ?? 5, 1), 30)),
      content_filter: "high",
    });
    if (query.orientation) params.set("orientation", query.orientation);

    const res = await this.fetchImpl(
      `https://api.unsplash.com/search/photos?${params.toString()}`,
      {
        headers: {
          Authorization: `Client-ID ${this.accessKey}`,
          "Accept-Version": "v1",
        },
      },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new AppError(
        502,
        `Unsplash error ${res.status}: ${body.slice(0, 200)}`,
        "UNSPLASH_UPSTREAM_ERROR",
      );
    }

    const json = (await res.json()) as UnsplashSearchResponse;
    const fetchedAt = new Date().toISOString();

    return (json.results ?? []).map((photo) => ({
      contentType: "image" as const,
      provider: this.name,
      providerRef: photo.id,
      fetchedAt,
      photoId: photo.id,
      description: photo.description ?? undefined,
      altDescription: photo.alt_description ?? undefined,
      width: photo.width,
      height: photo.height,
      imageUrl: photo.urls?.regular ?? photo.urls?.small ?? "",
      thumbUrl: photo.urls?.small ?? photo.urls?.thumb ?? photo.urls?.regular ?? "",
      fullUrl: photo.urls?.full,
      color: photo.color ?? undefined,
      photographerName: photo.user?.name ?? "Unknown",
      photographerUrl: photo.user?.links?.html,
      unsplashUrl: photo.links?.html,
      downloadLocation: photo.links?.download_location,
    }));
  }
}
