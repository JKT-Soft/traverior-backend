import type { PlaceProvider, PlaceSearchQuery } from "../domain/ports.js";

export class PlaceService {
  constructor(private readonly provider: PlaceProvider) {}
  search(query: PlaceSearchQuery) {
    return this.provider.searchPlaces(query);
  }
  searchRestaurants(city: string, dietary?: string[]) {
    const diet = dietary?.length ? `${dietary.join(" ")} ` : "";
    return this.search({ textQuery: `${diet}restaurants in ${city}` });
  }
  searchPois(city: string) {
    return this.search({ textQuery: `tourist attractions in ${city}` });
  }
  get providerName() {
    return this.provider.name;
  }
}
