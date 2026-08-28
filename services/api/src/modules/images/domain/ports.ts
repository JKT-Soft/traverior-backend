import type { ProviderMeta } from "../../../shared/types/provider.js";

export type LocationImageQuery = {
  /** Free-text search, e.g. "Osaka Japan travel" */
  query: string;
  perPage?: number;
  orientation?: "landscape" | "portrait" | "squarish";
};

export type LocationImage = ProviderMeta & {
  contentType: "image";
  photoId: string;
  description?: string;
  altDescription?: string;
  width: number;
  height: number;
  /** Regular-sized CDN URL (good for cards) */
  imageUrl: string;
  /** Smaller URL for list thumbnails */
  thumbUrl: string;
  /** Full URL if needed for hero */
  fullUrl?: string;
  color?: string;
  photographerName: string;
  photographerUrl?: string;
  unsplashUrl?: string;
  downloadLocation?: string;
};

export interface ImageProvider {
  readonly name: string;
  searchImages(query: LocationImageQuery): Promise<LocationImage[]>;
}
