import type { Env } from "../../../config/env.js";
import type { HotelOffer, HotelProvider, HotelSearchQuery } from "../domain/ports.js";

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
        countryCode: query.countryCode,
        maxRatesPerHotel: 1,
        includeHotelData: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`LiteAPI search failed (${res.status}): ${await res.text()}`);
    }

    const json = (await res.json()) as {
      data?: Array<{
        hotelId?: string;
        roomTypes?: Array<{
          rates?: Array<{
            retailRate?: { total?: Array<{ amount: number; currency: string }> };
          }>;
        }>;
      }>;
      hotels?: Array<{
        id: string;
        name: string;
        starRating?: number;
        address?: string;
      }>;
    };

    const hotelMeta = new Map((json.hotels ?? []).map((h) => [h.id, h]));
    return (json.data ?? []).slice(0, 10).map((row) => {
      const meta = hotelMeta.get(row.hotelId ?? "");
      const rate = row.roomTypes?.[0]?.rates?.[0]?.retailRate?.total?.[0];
      return {
        contentType: "hotel" as const,
        provider: this.name,
        providerRef: row.hotelId,
        fetchedAt: new Date().toISOString(),
        name: meta?.name ?? row.hotelId ?? "Hotel",
        checkIn: query.checkIn,
        checkOut: query.checkOut,
        stars: meta?.starRating,
        address: meta?.address,
        hotelId: row.hotelId ?? "unknown",
        price: {
          amount: rate?.amount ?? 0,
          currency: rate?.currency ?? query.currency ?? "IDR",
          isEstimate: !rate,
        },
      };
    });
  }
}

export function createLiteApiHotelProvider(env: Env): HotelProvider {
  const key = env.secrets.liteApiKey;
  if (!key) throw new Error("LITEAPI_KEY required for PROVIDER_HOTELS=liteapi");
  return new LiteApiHotelProvider(key);
}
