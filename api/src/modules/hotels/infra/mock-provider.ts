import type { HotelOffer, HotelProvider, HotelSearchQuery } from "../domain/ports.js";
import { nightsBetween } from "./map-liteapi-hotel.js";

export class MockHotelProvider implements HotelProvider {
  readonly name = "mock";

  async searchHotels(query: HotelSearchQuery): Promise<HotelOffer[]> {
    const nights = nightsBetween(query.checkIn, query.checkOut) || 1;
    const city = query.cityName;
    const location = {
      address: `Chuo, ${city}`,
      city,
      countryCode: query.countryCode ?? "JP",
      latitude: city.toLowerCase() === "osaka" ? 34.6937 : null,
      longitude: city.toLowerCase() === "osaka" ? 135.5023 : null,
    };

    return [
      {
        contentType: "hotel",
        provider: this.name,
        providerRef: `mock-hotel-${city.toLowerCase()}`,
        fetchedAt: new Date().toISOString(),
        deepLinkUrl: `https://example.com/hotels/${encodeURIComponent(city)}`,
        hotelId: `mock-hotel-${city.toLowerCase()}`,
        name: `${city} Central Hotel`,
        location,
        address: location.address,
        stars: 4,
        rating: 8.6,
        reviewCount: 1240,
        checkIn: query.checkIn,
        checkOut: query.checkOut,
        checkInTime: "15:00",
        checkOutTime: "11:00",
        nights,
        board: { type: "BB", name: "Breakfast" },
        refundable: true,
        price: {
          amount: 2_450_000 * nights,
          currency: query.currency ?? "IDR",
          isEstimate: true,
        },
      },
    ];
  }
}
