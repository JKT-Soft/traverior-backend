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

export type HotelLocation = {
  address: string | null;
  city: string | null;
  countryCode: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type HotelBoard = {
  type: string | null;
  name: string | null;
};

export type HotelOffer = ProviderMeta & {
  contentType: "hotel";
  hotelId: string;
  name: string;
  location: HotelLocation;
  /** Display alias of `location.address` (kept for pipeline/mobile). */
  address?: string;
  stars: number | null;
  rating: number | null;
  reviewCount: number | null;
  checkIn: string;
  checkOut: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  nights: number;
  board: HotelBoard;
  refundable: boolean | null;
  thumbnailUrl: string | null;
  price: Money;
};

export interface HotelProvider {
  readonly name: string;
  searchHotels(query: HotelSearchQuery): Promise<HotelOffer[]>;
  getHotelDetail?(hotelId: string): Promise<HotelOffer | null>;
}
