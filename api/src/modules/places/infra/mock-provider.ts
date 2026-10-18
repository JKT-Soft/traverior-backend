import type { PlaceProvider, PlaceResult, PlaceSearchQuery } from "../domain/ports.js";

export class MockPlaceProvider implements PlaceProvider {
  readonly name = "mock";

  async searchPlaces(query: PlaceSearchQuery): Promise<PlaceResult[]> {
    return [
      {
        contentType: "place",
        provider: this.name,
        providerRef: "mock-place-1",
        fetchedAt: new Date().toISOString(),
        placeId: "mock-place-1",
        name: `Top spot for ${query.textQuery}`,
        rating: 4.6,
        priceLevel: 2,
        types: ["restaurant"],
        formattedAddress: "Mock Street 1",
        isFree: false,
        thumbnailUrl:
          "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=400&q=80",
      },
    ];
  }
}
