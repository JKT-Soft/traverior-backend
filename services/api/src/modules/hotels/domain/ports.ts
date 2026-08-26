import type { Money, ProviderMeta } from "../../../shared/types/provider.js";

export type HotelSearchQuery = {
  cityName: string;
  countryCode?: string;
  checkIn: string;
  checkOut: string;
  adults?: number;
  currency?: string;
  guestNationality?: string;
};

export type HotelOffer = ProviderMeta & {
  contentType: "hotel";
  name: string;
  checkIn: string;
  checkOut: string;
  stars?: number;
  address?: string;
  hotelId: string;
  price: Money;
};

export interface HotelProvider {
  readonly name: string;
  searchHotels(query: HotelSearchQuery): Promise<HotelOffer[]>;
  getHotelDetail?(hotelId: string): Promise<HotelOffer | null>;
}
