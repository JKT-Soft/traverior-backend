import { hotelSearchDeepLink } from "../../../shared/deep-link.js";
import type { HotelBoard, HotelLocation, HotelOffer, HotelSearchQuery } from "../domain/ports.js";

export type LiteApiPlace = {
  id?: string;
  name?: string;
  address?: string;
  city?: string;
  city_name?: string;
  country_code?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
  rating?: number;
  stars?: number;
  starRating?: number;
  review_count?: number;
  reviewCount?: number;
  checkinCheckoutTimes?: {
    checkout?: string;
    checkin?: string;
    checkin_start?: string;
    checkin_end?: string;
  };
};

export type LiteApiRate = {
  boardType?: string;
  boardName?: string;
  retailRate?: { total?: Array<{ amount?: number; currency?: string }> };
  cancellationPolicies?: { refundableTag?: string };
};

export type LiteApiHotelRow = {
  hotelId?: string;
  roomTypes?: Array<{
    offerRetailRate?: { amount?: number; currency?: string };
    rates?: LiteApiRate[];
  }>;
};

export type LiteApiRatesResponse = {
  data?: LiteApiHotelRow[];
  hotels?: LiteApiPlace[];
};

export function nightsBetween(checkIn: string, checkOut: string): number {
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round((end - start) / 86_400_000);
}

export function parseHotelTime(raw?: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  const hour24 = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (hour24) return `${hour24[1]!.padStart(2, "0")}:${hour24[2]}`;
  const meridem = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(value);
  if (!meridem) return value;
  let hour = Number(meridem[1]);
  const minute = meridem[2]!;
  const period = meridem[3]!.toUpperCase();
  if (period === "AM") hour = hour === 12 ? 0 : hour;
  else hour = hour === 12 ? 12 : hour + 12;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

export function refundableFromTag(tag?: string | null): boolean | null {
  if (!tag) return null;
  const normalized = tag.trim().toUpperCase();
  if (normalized === "RFN") return true;
  if (normalized === "NRFN") return false;
  return null;
}

export function mapLiteApiHotel(
  row: LiteApiHotelRow,
  meta: LiteApiPlace | undefined,
  query: HotelSearchQuery,
  provider: string,
): HotelOffer {
  const rate = row.roomTypes?.[0]?.rates?.[0];
  const offerTotal = row.roomTypes?.[0]?.offerRetailRate;
  const total = rate?.retailRate?.total?.[0];
  const amount = total?.amount ?? offerTotal?.amount ?? 0;
  const currency = total?.currency ?? offerTotal?.currency ?? query.currency ?? "IDR";
  const location = locationFrom(meta, query);
  const times = meta?.checkinCheckoutTimes;
  const board = boardFrom(rate);

  const name = meta?.name ?? row.hotelId ?? "Hotel";
  return {
    contentType: "hotel",
    provider,
    providerRef: row.hotelId,
    fetchedAt: new Date().toISOString(),
    // Native LiteAPI links need a white-label domain; use Google Hotels as View offer.
    deepLinkUrl: hotelSearchDeepLink({
      name,
      city: location.city,
      checkIn: query.checkIn,
      checkOut: query.checkOut,
    }),
    hotelId: row.hotelId ?? "unknown",
    name,
    location,
    address: location.address ?? undefined,
    stars: numberOrNull(meta?.stars ?? meta?.starRating),
    rating: numberOrNull(meta?.rating),
    reviewCount: numberOrNull(meta?.review_count ?? meta?.reviewCount),
    checkIn: query.checkIn,
    checkOut: query.checkOut,
    checkInTime: parseHotelTime(times?.checkin_start ?? times?.checkin),
    checkOutTime: parseHotelTime(times?.checkout),
    nights: nightsBetween(query.checkIn, query.checkOut),
    board,
    refundable: refundableFromTag(rate?.cancellationPolicies?.refundableTag),
    price: {
      amount,
      currency,
      isEstimate: total == null && offerTotal == null,
    },
  };
}

function locationFrom(meta: LiteApiPlace | undefined, query: HotelSearchQuery): HotelLocation {
  return {
    address: meta?.address ?? null,
    city: meta?.city_name ?? meta?.city ?? query.cityName,
    countryCode: meta?.country_code ?? meta?.countryCode ?? query.countryCode ?? null,
    latitude: numberOrNull(meta?.latitude),
    longitude: numberOrNull(meta?.longitude),
  };
}

function boardFrom(rate?: LiteApiRate): HotelBoard {
  return {
    type: rate?.boardType?.trim() || null,
    name: rate?.boardName?.trim() || null,
  };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
