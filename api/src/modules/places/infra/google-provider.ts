import type { Env } from "../../../config/env.js";
import type { PlaceProvider, PlaceResult, PlaceSearchQuery } from "../domain/ports.js";

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  priceLevel?: string;
  types?: string[];
  photos?: Array<{ name?: string }>;
};

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
          "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.priceLevel,places.types,places.photos",
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

    const json = (await res.json()) as { places?: GooglePlace[] };
    return Promise.all((json.places ?? []).map((place) => this.toPlace(place)));
  }

  private async toPlace(place: GooglePlace): Promise<PlaceResult> {
    return {
      contentType: "place",
      provider: this.name,
      providerRef: place.id,
      fetchedAt: new Date().toISOString(),
      placeId: place.id ?? "",
      name: place.displayName?.text ?? "Place",
      rating: place.rating,
      types: place.types ?? [],
      formattedAddress: place.formattedAddress,
      lat: place.location?.latitude,
      lng: place.location?.longitude,
      isFree: false,
      thumbnailUrl: await this.photoUrl(place.photos?.[0]?.name),
    };
  }

  private async photoUrl(photoName?: string): Promise<string | null> {
    if (!photoName) return null;
    try {
      const res = await fetch(
        `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=400&maxWidthPx=400&skipHttpRedirect=true`,
        { headers: { "X-Goog-Api-Key": this.apiKey } },
      );
      if (!res.ok) return null;
      const json = (await res.json()) as { photoUri?: string };
      const uri = json.photoUri?.trim();
      return uri && /^https?:\/\//i.test(uri) ? uri : null;
    } catch {
      return null;
    }
  }
}

export function createGooglePlaceProvider(env: Env): PlaceProvider {
  const key = env.secrets.googleMapsApiKey;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY required for PROVIDER_PLACES=google");
  return new GooglePlaceProvider(key);
}
