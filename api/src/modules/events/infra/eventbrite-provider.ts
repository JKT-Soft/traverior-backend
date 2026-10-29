import type { Env } from "../../../config/env.js";
import type { EventProvider, EventResult, EventSearchQuery } from "../domain/ports.js";

type EventbriteMoney = {
  currency?: string;
  value?: number;
  major_value?: string;
};

type EventbriteEvent = {
  id?: string;
  name?: { text?: string } | string;
  url?: string;
  start?: { utc?: string; local?: string };
  is_free?: boolean;
  logo?: { url?: string; original?: { url?: string } };
  ticket_availability?: {
    is_free?: boolean;
    minimum_ticket_price?: EventbriteMoney;
  };
};

type JsonLdEvent = {
  "@type"?: string;
  name?: string;
  url?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  image?: string | { url?: string; contentUrl?: string } | Array<string | { url?: string; contentUrl?: string }>;
  offers?:
    | { price?: string | number; priceCurrency?: string; lowPrice?: string | number }
    | Array<{ price?: string | number; priceCurrency?: string; lowPrice?: string | number }>;
  isAccessibleForFree?: boolean;
};

type JsonLdList = {
  itemListElement?: Array<{
    item?: JsonLdEvent;
    "@type"?: string;
  }>;
};

/** Well-known Eventbrite discovery location slugs (public search API shut down Dec 2019). */
const CITY_SLUGS: Record<string, string> = {
  osaka: "japan--osaka",
  tokyo: "japan--tokyo",
  kyoto: "japan--kyoto",
  yokohama: "japan--yokohama",
  nagoya: "japan--nagoya",
  fukuoka: "japan--fukuoka",
  sapporo: "japan--sapporo",
  jakarta: "indonesia--jakarta",
  bali: "indonesia--bali",
  singapore: "singapore--singapore",
  bangkok: "thailand--bangkok",
  seoul: "south-korea--seoul",
  busan: "south-korea--busan",
  taipei: "taiwan--taipei",
  london: "united-kingdom--london",
  paris: "france--paris",
  "new york": "ny--new-york",
  "san francisco": "ca--san-francisco",
};

function toSlug(city: string): string {
  const key = city.trim().toLowerCase();
  if (CITY_SLUGS[key]) return CITY_SLUGS[key];
  const hyphen = key.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return hyphen;
}

function parseMajorValue(major?: string): number | undefined {
  if (!major) return undefined;
  const n = Number(major);
  return Number.isFinite(n) ? n : undefined;
}

function eventName(e: EventbriteEvent): string {
  if (typeof e.name === "string") return e.name;
  return e.name?.text ?? "Event";
}

function mapApiEvent(e: EventbriteEvent, fetchedAt: string): EventResult {
  const isFree =
    e.is_free === true ||
    e.ticket_availability?.is_free === true ||
    e.ticket_availability?.minimum_ticket_price?.value === 0;

  const min = e.ticket_availability?.minimum_ticket_price;
  const amount =
    parseMajorValue(min?.major_value) ??
    (typeof min?.value === "number" ? min.value / 100 : 0);

  return {
    contentType: "event",
    provider: "eventbrite",
    providerRef: e.id,
    fetchedAt,
    deepLinkUrl: e.url,
    name: eventName(e),
    isFree,
    price: {
      amount: isFree ? 0 : amount,
      currency: min?.currency ?? "USD",
      isEstimate: !isFree && min == null,
    },
    startsAt: e.start?.utc ?? e.start?.local,
    source: "eventbrite",
    externalId: e.id ?? "unknown",
    thumbnailUrl: httpUrl(e.logo?.original?.url) ?? httpUrl(e.logo?.url),
  };
}

function extractEventId(url?: string): string {
  if (!url) return "unknown";
  const m = url.match(/-tickets-(\d+)/) ?? url.match(/\/e\/[^/]*?(\d{8,})/);
  return m?.[1] ?? url;
}

function offerPrice(event: JsonLdEvent): { amount: number; currency: string; isFree: boolean } | null {
  const offers = Array.isArray(event.offers) ? event.offers[0] : event.offers;
  if (!offers) return null;
  const raw = offers.lowPrice ?? offers.price;
  if (raw == null) return null;
  const amount = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(amount)) return null;
  return {
    amount,
    currency: offers.priceCurrency ?? "USD",
    isFree: amount === 0 || event.isAccessibleForFree === true,
  };
}

function mapLdEvent(event: JsonLdEvent, fetchedAt: string): EventResult {
  const priced = offerPrice(event);
  const isFree = event.isAccessibleForFree === true || priced?.isFree === true;
  return {
    contentType: "event",
    provider: "eventbrite",
    providerRef: extractEventId(event.url),
    fetchedAt,
    deepLinkUrl: event.url,
    name: event.name ?? "Event",
    isFree,
    price: {
      amount: isFree ? 0 : (priced?.amount ?? 0),
      currency: priced?.currency ?? "USD",
      isEstimate: !isFree && priced == null,
    },
    startsAt: event.startDate,
    source: "eventbrite",
    externalId: extractEventId(event.url),
    thumbnailUrl: jsonLdImageUrl(event.image),
  };
}

function httpUrl(value?: string | null): string | null {
  const url = value?.trim();
  return url && /^https?:\/\//i.test(url) ? url : null;
}

function jsonLdImageUrl(
  image?: JsonLdEvent["image"],
): string | null {
  if (!image) return null;
  const first = Array.isArray(image) ? image[0] : image;
  if (typeof first === "string") return httpUrl(first);
  if (first && typeof first === "object") {
    return httpUrl(first.url) ?? httpUrl(first.contentUrl);
  }
  return null;
}

function inDateRange(startsAt: string | undefined, startDate?: string, endDate?: string): boolean {
  if (!startsAt) return true;
  const day = startsAt.slice(0, 10);
  if (startDate && day < startDate) return false;
  if (endDate && day > endDate) return false;
  return true;
}

function filterFreePaid(items: EventResult[], query: EventSearchQuery): EventResult[] {
  const includeFree = query.includeFree !== false;
  const includePaid = query.includePaid !== false;
  return items.filter((e) => {
    if (!inDateRange(e.startsAt, query.startDate, query.endDate)) return false;
    // Unknown price kept when both free+paid requested
    if (e.price.isEstimate && includeFree && includePaid) return true;
    if (e.isFree) return includeFree;
    return includePaid;
  });
}

export class EventbriteEventProvider implements EventProvider {
  readonly name = "eventbrite";

  constructor(private readonly token: string) {}

  async searchEvents(query: EventSearchQuery): Promise<EventResult[]> {
    const includeFree = query.includeFree !== false;
    const includePaid = query.includePaid !== false;
    if (!includeFree && !includePaid) return [];

    // 1) Official search (removed Dec 2019 for most tokens — keep for partner access)
    const apiResults = await this.tryOfficialSearch(query);
    if (apiResults) return filterFreePaid(apiResults, query);

    // 2) Public discovery pages (JSON-LD) — real city-wide Eventbrite listings
    const discovery = await this.searchDiscovery(query);
    return filterFreePaid(discovery, query);
  }

  private async tryOfficialSearch(query: EventSearchQuery): Promise<EventResult[] | null> {
    const params = new URLSearchParams();
    params.set("location.address", query.city);
    params.set("expand", "venue,ticket_availability,logo");
    params.set("sort_by", "date");
    if (query.startDate) params.set("start_date.range_start", `${query.startDate}T00:00:00Z`);
    if (query.endDate) params.set("start_date.range_end", `${query.endDate}T23:59:59Z`);
    if (query.includeFree !== false && query.includePaid === false) params.set("price", "free");
    if (query.includePaid !== false && query.includeFree === false) params.set("price", "paid");

    const url = `https://www.eventbriteapi.com/v3/events/search/?${params.toString()}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
      },
    });

    if (res.status === 404) return null; // public search shut down — fall through

    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `Eventbrite API failed (${res.status}): ${body}. Check EVENTBRITE_TOKEN.`,
      );
    }

    const json = (await res.json()) as { events?: EventbriteEvent[] };
    const fetchedAt = new Date().toISOString();
    return (json.events ?? []).map((e) => mapApiEvent(e, fetchedAt));
  }

  private async searchDiscovery(query: EventSearchQuery): Promise<EventResult[]> {
    const slug = toSlug(query.city);
    const params = new URLSearchParams();
    if (query.startDate) params.set("start_date", query.startDate);
    if (query.endDate) params.set("end_date", query.endDate);
    if (query.includeFree !== false && query.includePaid === false) params.set("price", "free");
    if (query.includePaid !== false && query.includeFree === false) params.set("price", "paid");

    const qs = params.toString();
    const url = `https://www.eventbrite.com/d/${slug}/events/${qs ? `?${qs}` : ""}`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "text/html",
        "User-Agent": "TraveriorAPI/0.1 (+https://traverior.com)",
      },
    });

    if (!res.ok) {
      throw new Error(
        `Eventbrite discovery failed (${res.status}) for city "${query.city}" (slug=${slug}).`,
      );
    }

    const html = await res.text();
    const matches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
    const fetchedAt = new Date().toISOString();
    const results: EventResult[] = [];
    const seen = new Set<string>();

    for (const match of matches) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(match[1]!);
      } catch {
        continue;
      }
      const lists = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of lists) {
        const list = node as JsonLdList;
        for (const el of list.itemListElement ?? []) {
          const item = el.item;
          if (!item || item["@type"] !== "Event") continue;
          const mapped = mapLdEvent(item, fetchedAt);
          if (seen.has(mapped.externalId)) continue;
          seen.add(mapped.externalId);
          results.push(mapped);
        }
      }
    }

    return results;
  }
}

export function createEventbriteEventProvider(env: Env): EventProvider {
  const token = env.secrets.eventbriteToken;
  if (!token) {
    throw new Error("EVENTBRITE_TOKEN required for PROVIDER_EVENTS=eventbrite");
  }
  return new EventbriteEventProvider(token);
}

export { toSlug as eventbriteCitySlug };
