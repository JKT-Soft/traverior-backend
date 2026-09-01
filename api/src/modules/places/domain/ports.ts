import type { ProviderMeta } from "../../../shared/types/provider.js";

export type PlaceSearchQuery = {
  textQuery: string;
  maxResultCount?: number;
  languageCode?: string;
};

export type PlaceResult = ProviderMeta & {
  contentType: "place";
  placeId: string;
  name: string;
  rating?: number;
  priceLevel?: number;
  types: string[];
  formattedAddress?: string;
  lat?: number;
  lng?: number;
  isFree?: boolean;
};

export interface PlaceProvider {
  readonly name: string;
  searchPlaces(query: PlaceSearchQuery): Promise<PlaceResult[]>;
  getPlaceDetail?(placeId: string): Promise<PlaceResult | null>;
}
