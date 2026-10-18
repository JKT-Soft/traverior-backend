import type { Env } from "../../../config/env.js";
import type { HotelOffer, HotelProvider, HotelSearchQuery } from "../domain/ports.js";
import { mapLiteApiHotel, type LiteApiRatesResponse } from "./map-liteapi-hotel.js";

export class LiteApiHotelProvider implements HotelProvider {
  readonly name = "liteapi";

  constructor(private readonly apiKey: string) {}

  async searchHotels(query: HotelSearchQuery): Promise<HotelOffer[]> {
    const res = await fetch("https://api.liteapi.travel/v3.0/hotels/rates", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-API-Key": this.apiKey,
      },
      body: JSON.stringify({
        checkin: query.checkIn,
        checkout: query.checkOut,
        currency: query.currency ?? "IDR",
        guestNationality: query.guestNationality ?? "ID",
        occupancies: [{ adults: query.adults ?? 2 }],
        cityName: query.cityName,
        ...(query.countryCode ? { countryCode: query.countryCode } : {}),
        maxRatesPerHotel: 1,
        includeHotelData: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`LiteAPI search failed (${res.status}): ${await res.text()}`);
    }

    const json = (await res.json()) as LiteApiRatesResponse;
    const hotelMeta = new Map((json.hotels ?? []).map((hotel) => [hotel.id ?? "", hotel]));
    return (json.data ?? [])
      .slice(0, 10)
      .map((row) => mapLiteApiHotel(row, hotelMeta.get(row.hotelId ?? ""), query, this.name));
  }
}

export function createLiteApiHotelProvider(env: Env): HotelProvider {
  const key = env.secrets.liteApiKey;
  if (!key) throw new Error("LITEAPI_KEY required for PROVIDER_HOTELS=liteapi");
  return new LiteApiHotelProvider(key);
}
