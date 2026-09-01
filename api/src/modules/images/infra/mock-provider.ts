import type { ImageProvider, LocationImage, LocationImageQuery } from "../domain/ports.js";

export class MockImageProvider implements ImageProvider {
  readonly name = "mock";

  async searchImages(query: LocationImageQuery): Promise<LocationImage[]> {
    const q = encodeURIComponent(query.query.slice(0, 40));
    const count = Math.min(query.perPage ?? 5, 10);
    return Array.from({ length: count }, (_, i) => ({
      contentType: "image" as const,
      provider: this.name,
      providerRef: `mock-img-${i + 1}`,
      fetchedAt: new Date().toISOString(),
      photoId: `mock-${i + 1}`,
      description: `Mock photo for ${query.query}`,
      altDescription: query.query,
      width: 1200,
      height: 800,
      imageUrl: `https://picsum.photos/seed/${q}-${i}/800/600`,
      thumbUrl: `https://picsum.photos/seed/${q}-${i}/400/300`,
      fullUrl: `https://picsum.photos/seed/${q}-${i}/1600/1200`,
      photographerName: "Mock Photographer",
      photographerUrl: "https://example.com",
      unsplashUrl: "https://unsplash.com",
    }));
  }
}
