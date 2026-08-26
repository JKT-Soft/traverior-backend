import type { HotelProvider, HotelSearchQuery } from "../domain/ports.js";

export class HotelService {
  constructor(private readonly provider: HotelProvider) {}

  search(query: HotelSearchQuery) {
    return this.provider.searchHotels(query);
  }

  get providerName() {
    return this.provider.name;
  }
}
