import type { Env } from "../../../config/env.js";
import type { PlaceProvider, PlaceResult, PlaceSearchQuery } from "../domain/ports.js";

export class GooglePlaceProvider implements PlaceProvider {
  readonly name = "google_places";

  constructor(private readonly apiKey: string) {}

  async searchPlaces(query: PlaceSearchQuery): Promise<PlaceResult[]> {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.priceLevel,places.types",
      },
      body: JSON.stringify({
        textQuery: query.textQuery,
        maxResultCount: query.maxResultCount ?? 8,
        languageCode: query.languageCode ?? "id",
      }),
    });

    if (!res.ok) {
      throw new Error(`Google Places failed (${res.status}): ${await res.text()}`);
    }

    const json = (await res.json()) as {
      places?: Array<{
        id?: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        location?: { latitude?: number; longitude?: number };
        rating?: number;
        priceLevel?: string;
        types?: string[];
      }>;
    };

    return (json.places ?? []).map((p) => ({
      contentType: "place" as const,
      provider: this.name,
      providerRef: p.id,
      fetchedAt: new Date().toISOString(),
      placeId: p.id ?? "",
      name: p.displayName?.text ?? "Place",
      rating: p.rating,
      types: p.types ?? [],
      formattedAddress: p.formattedAddress,
      lat: p.location?.latitude,
      lng: p.location?.longitude,
      isFree: false,
    }));
  }
}

export function createGooglePlaceProvider(env: Env): PlaceProvider {
  const key = env.secrets.googleMapsApiKey;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY required for PROVIDER_PLACES=google");
  return new GooglePlaceProvider(key);
}
