import type { HotelOffer, HotelProvider, HotelSearchQuery } from "../domain/ports.js";

export class MockHotelProvider implements HotelProvider {
  readonly name = "mock";

  async searchHotels(query: HotelSearchQuery): Promise<HotelOffer[]> {
    return [
      {
        contentType: "hotel",
        provider: this.name,
        providerRef: `mock-hotel-${query.cityName.toLowerCase()}`,
        fetchedAt: new Date().toISOString(),
        deepLinkUrl: `https://example.com/hotels/${encodeURIComponent(query.cityName)}`,
        name: `${query.cityName} Central Hotel`,
        checkIn: query.checkIn,
        checkOut: query.checkOut,
        stars: 4,
        address: `Downtown ${query.cityName}`,
        hotelId: `mock-hotel-${query.cityName.toLowerCase()}`,
        price: {
          amount: 1200000,
          currency: query.currency ?? "IDR",
          isEstimate: true,
        },
      },
    ];
  }
}
