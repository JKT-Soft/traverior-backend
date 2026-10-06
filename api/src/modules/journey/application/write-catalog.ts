import type { Prisma, PrismaClient } from "@prisma/client";
import type { PlanBookingDraft } from "./persist-plan.js";

type CatalogDb = Pick<
  PrismaClient,
  | "catalogFlight"
  | "catalogHotel"
  | "catalogEvent"
  | "catalogPlace"
  | "catalogRoute"
  | "catalogWeather"
  | "catalogVisa"
  | "catalogChecklist"
>;

export type CatalogLink = {
  catalogFlightId?: string;
  catalogHotelId?: string;
  catalogEventId?: string;
  catalogPlaceId?: string;
  catalogRouteId?: string;
  catalogWeatherId?: string;
  catalogVisaId?: string;
  catalogChecklistId?: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function chars(value: unknown, length: number): string | undefined {
  const raw = text(value)?.toUpperCase();
  if (!raw || raw.length < length) return undefined;
  return raw.slice(0, length);
}

function integer(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
}

function decimal(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function money(value: unknown): { amount?: number; currency?: string } {
  const row = record(value);
  return { amount: decimal(row.amount), currency: chars(row.currency, 3) };
}

function asDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== "string" || value.length === 0) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function asDay(value: unknown): Date | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  return asDate(raw.length === 10 ? `${raw}T00:00:00.000Z` : raw);
}

function json(value: unknown): Prisma.InputJsonValue | undefined {
  if (value == null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function providerOf(booking: PlanBookingDraft, payload: Record<string, unknown>): string {
  return booking.provider ?? text(payload.provider) ?? "unknown";
}

function link(kind: keyof CatalogLink, id: string): CatalogLink {
  return { [kind]: id };
}

export async function createCatalogLink(
  db: CatalogDb,
  tripId: string,
  booking: PlanBookingDraft,
): Promise<CatalogLink> {
  const payload = booking.payload;
  const provider = providerOf(booking, payload);
  const price = money(payload.price);
  const now = new Date();

  switch (booking.kind) {
    case "flight": {
      const airline = record(payload.airline);
      const originAirport = record(payload.originAirport);
      const destinationAirport = record(payload.destinationAirport);
      const row = await db.catalogFlight.create({
        data: {
          tripId,
          provider,
          providerRef: booking.providerRef ?? text(payload.id),
          airlineName: text(airline.name) ?? text(payload.carrier),
          airlineIata: chars(airline.iataCode, 2),
          carrier: text(payload.carrier) ?? text(airline.name),
          flightNumber: text(payload.flightNumber),
          originIata: chars(payload.origin, 3) ?? chars(originAirport.code, 3) ?? "XXX",
          destinationIata: chars(payload.destination, 3) ?? chars(destinationAirport.code, 3) ?? "XXX",
          originAirport: json(payload.originAirport),
          destinationAirport: json(payload.destinationAirport),
          departureAt: asDate(payload.departureAt),
          arrivalAt: asDate(payload.arrivalAt),
          cabin: text(payload.cabin),
          cabinLabel: text(payload.cabinLabel),
          stops: integer(payload.stops),
          transit: text(payload.transit),
          durationMinutes: integer(payload.durationMinutes),
          baggage: json(payload.baggage),
          slices: json(payload.slices),
          priceAmount: booking.costAmount ?? price.amount,
          priceCurrency: chars(booking.costCurrency, 3) ?? price.currency,
          priceIsEstimate: false,
          deepLinkUrl: booking.deepLinkUrl ?? text(payload.deepLink),
          raw: json(payload),
          fetchedAt: now,
        },
      });
      return link("catalogFlightId", row.id);
    }
    case "hotel": {
      const location = record(payload.location);
      const board = record(payload.board);
      const row = await db.catalogHotel.create({
        data: {
          tripId,
          provider,
          providerRef: booking.providerRef ?? text(payload.hotelId),
          hotelId: text(payload.hotelId),
          name: text(payload.name) ?? "Hotel",
          stars: integer(payload.stars),
          rating: decimal(payload.rating),
          reviewCount: integer(payload.reviewCount),
          boardType: text(board.type) ?? text(payload.boardType),
          boardName: text(board.name) ?? text(payload.boardName),
          nights: integer(payload.nights),
          address: text(payload.address) ?? text(location.address),
          city: text(payload.city) ?? text(location.city),
          countryCode: chars(payload.countryCode, 2) ?? chars(location.countryCode, 2),
          lat: decimal(payload.lat) ?? decimal(location.latitude),
          lng: decimal(payload.lng) ?? decimal(location.longitude),
          checkIn: asDay(payload.checkIn),
          checkOut: asDay(payload.checkOut),
          checkInTime: text(payload.checkInTime),
          checkOutTime: text(payload.checkOutTime),
          refundable: typeof payload.refundable === "boolean" ? payload.refundable : undefined,
          priceAmount: booking.costAmount ?? price.amount,
          priceCurrency: chars(booking.costCurrency, 3) ?? price.currency,
          priceIsEstimate: true,
          deepLinkUrl: booking.deepLinkUrl ?? text(payload.deepLink),
          raw: json(payload),
          fetchedAt: now,
        },
      });
      return link("catalogHotelId", row.id);
    }
    case "event": {
      const row = await db.catalogEvent.create({
        data: {
          tripId,
          provider,
          providerRef: booking.providerRef ?? text(payload.externalId) ?? text(payload.id),
          externalId: text(payload.externalId) ?? text(payload.id),
          name: text(payload.name) ?? text(payload.title) ?? "Event",
          startsAt: asDate(payload.startsAt),
          endsAt: asDate(payload.endsAt),
          isFree: typeof payload.isFree === "boolean" ? payload.isFree : undefined,
          venueName: text(payload.venueName),
          address: text(payload.address),
          lat: decimal(payload.lat),
          lng: decimal(payload.lng),
          priceAmount: booking.costAmount ?? price.amount,
          priceCurrency: chars(booking.costCurrency, 3) ?? price.currency,
          priceIsEstimate: true,
          deepLinkUrl: booking.deepLinkUrl ?? text(payload.deepLink),
          raw: json(payload),
          fetchedAt: now,
        },
      });
      return link("catalogEventId", row.id);
    }
    case "place": {
      const kind = text(payload.placeKind) === "restaurants" ? "restaurants" : "pois";
      const places = Array.isArray(payload.places) ? payload.places : [];
      const row = await db.catalogPlace.create({
        data: {
          tripId,
          provider,
          kind,
          title: kind === "restaurants" ? "Restaurants" : "Points of interest",
          places: json(places) ?? [],
          raw: json(payload),
          fetchedAt: now,
        },
      });
      return link("catalogPlaceId", row.id);
    }
    case "route": {
      const route = record(payload.route);
      const source = Object.keys(route).length > 0 ? route : payload;
      const row = await db.catalogRoute.create({
        data: {
          tripId,
          provider: text(source.provider) ?? provider,
          mode: text(source.mode),
          distanceMeters: integer(source.distanceMeters),
          durationMinutes: integer(source.durationMinutes),
          stepsSummary: json(source.stepsSummary),
          polyline: text(source.polyline),
          raw: json(payload),
          fetchedAt: now,
        },
      });
      return link("catalogRouteId", row.id);
    }
    case "weather": {
      const forecast = record(payload.forecast);
      const source = Object.keys(forecast).length > 0 ? forecast : payload;
      const row = await db.catalogWeather.create({
        data: {
          tripId,
          provider: text(source.provider) ?? provider,
          lat: decimal(source.lat),
          lng: decimal(source.lng) ?? decimal(source.lon),
          timezone: text(source.timezone),
          currentTempC: decimal(source.currentTempC),
          alerts: json(source.alerts),
          daily: json(source.daily),
          raw: json(payload),
          fetchedAt: now,
        },
      });
      return link("catalogWeatherId", row.id);
    }
    case "visa": {
      const requirements = record(payload.requirements);
      const source = Object.keys(requirements).length > 0 ? requirements : payload;
      const row = await db.catalogVisa.create({
        data: {
          tripId,
          provider: text(source.provider) ?? provider,
          passportCountry: chars(source.passportCountry, 2) ?? "XX",
          destinationCountry: chars(source.destinationCountry, 2) ?? "XX",
          summary: text(source.summary),
          documents: json(source.documents),
          requirements: json(source),
          raw: json(payload),
          fetchedAt: asDate(source.fetchedAt) ?? now,
        },
      });
      return link("catalogVisaId", row.id);
    }
    case "checklist": {
      const checklist = record(payload.checklist);
      const items = Array.isArray(payload.items)
        ? payload.items
        : Array.isArray(checklist.items)
          ? checklist.items
          : [];
      const row = await db.catalogChecklist.create({
        data: {
          tripId,
          provider,
          title: text(checklist.title) ?? "Travel checklist",
          items: json(items) ?? [],
          raw: json(payload),
          fetchedAt: asDate(payload.fetchedAt) ?? now,
        },
      });
      return link("catalogChecklistId", row.id);
    }
    default:
      return {};
  }
}
