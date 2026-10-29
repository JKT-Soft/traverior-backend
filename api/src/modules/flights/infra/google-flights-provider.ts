import type { Env } from "../../../config/env.js";
import type {
  FlightBookingOption,
  FlightOffer,
  FlightOfferDetail,
  FlightOfferDetailQuery,
  FlightProvider,
  FlightSearchQuery,
} from "../domain/ports.js";
import {
  fetchGoogleBookingOptions,
  type GoogleBookingFetcher,
} from "./google-flights-booking.js";
import { fetchGoogleFlightsShopping } from "./google-flights-rpc.js";
import {
  buildBookingDeepLink,
  buildDeepLink,
  mapGoogleFlightsOffer,
} from "./map-google-flights-offer.js";

/**
 * Google Travel Flights adapter — scrapes Google Flights HTML (ds:1 embed).
 * Offer detail uses Playwright to intercept GetBookingResults vendor cards
 * (airline / OTA deep links). Swap via PROVIDER_FLIGHTS=google.
 */
export class GoogleFlightsProvider implements FlightProvider {
  readonly name = "google";

  constructor(
    private readonly options: {
      currency: string;
      language: string;
      limit?: number;
      fetchBookingOptions?: GoogleBookingFetcher;
    } = { currency: "USD", language: "en" },
  ) {}

  async searchFlights(query: FlightSearchQuery): Promise<FlightOffer[]> {
    const result = await fetchGoogleFlightsShopping({
      origin: query.origin,
      destination: query.destination,
      departureDate: query.departureDate,
      returnDate: query.returnDate,
      adults: query.adults,
      cabinClass: query.cabinClass,
      currency: this.options.currency,
      language: this.options.language,
    });

    const limit = this.options.limit ?? 10;
    return result.itineraries.slice(0, limit).map((itinerary) =>
      mapGoogleFlightsOffer(itinerary, query, this.name, {
        currency: result.currency,
        language: this.options.language,
      }),
    );
  }

  async getOfferDetail(query: FlightOfferDetailQuery): Promise<FlightOfferDetail | null> {
    const currency = (query.currency ?? this.options.currency).toUpperCase();
    const language = this.options.language;
    const offer = await this.resolveOffer(query, currency);
    if (!offer) return null;

    const bookingToken = query.bookingToken?.trim() || offer.bookingToken;
    const deepLinkUrl =
      bookingToken != null && bookingToken.length > 0
        ? buildBookingDeepLink(bookingToken, currency, language)
        : offer.deepLinkUrl;

    const resolvedOffer: FlightOffer = {
      ...offer,
      bookingToken: bookingToken || offer.bookingToken,
      deepLinkUrl,
    };

    let bookingOptions: FlightBookingOption[] = [];
    const hasRoute =
      Boolean(resolvedOffer.origin) &&
      Boolean(resolvedOffer.destination) &&
      Boolean(resolvedOffer.departureAt);
    if (bookingToken || hasRoute) {
      try {
        const fetchOptions =
          this.options.fetchBookingOptions ?? fetchGoogleBookingOptions;
        bookingOptions = await fetchOptions({
          bookingToken,
          currency,
          language,
          origin: resolvedOffer.origin || undefined,
          destination: resolvedOffer.destination || undefined,
          departureDate: resolvedOffer.departureAt?.slice(0, 10) || undefined,
          flightNumber: resolvedOffer.flightNumber || undefined,
          airlineName:
            resolvedOffer.airline.name && resolvedOffer.airline.name !== "Unknown"
              ? resolvedOffer.airline.name
              : undefined,
        });
      } catch {
        bookingOptions = [];
      }
    }

    if (bookingOptions.length === 0) {
      bookingOptions = this.buildFallbackBookingOptions(
        resolvedOffer,
        bookingToken,
        currency,
        language,
      );
    }

    return { offer: resolvedOffer, bookingOptions };
  }

  private async resolveOffer(
    query: FlightOfferDetailQuery,
    currency: string,
  ): Promise<FlightOffer | null> {
    const origin = query.origin?.trim().toUpperCase();
    const destination = query.destination?.trim().toUpperCase();
    const departureDate = query.departureDate?.trim();

    if (origin && destination && departureDate) {
      const searchQuery: FlightSearchQuery = {
        origin,
        destination,
        departureDate,
        returnDate: query.returnDate,
        adults: query.adults,
        cabinClass: query.cabinClass,
      };
      const offers = await this.searchFlights(searchQuery);
      const matched = matchOffer(offers, query);
      if (matched) return matched;
      if (offers[0] && query.bookingToken) {
        return {
          ...offers[0],
          bookingToken: query.bookingToken,
          deepLinkUrl: buildBookingDeepLink(query.bookingToken, currency, this.options.language),
        };
      }
      return matched ?? offers[0] ?? null;
    }

    if (query.bookingToken?.trim()) {
      return {
        contentType: "flight",
        provider: this.name,
        providerRef: query.providerRef ?? `google-token-${query.bookingToken.slice(0, 12)}`,
        fetchedAt: new Date().toISOString(),
        deepLinkUrl: buildBookingDeepLink(
          query.bookingToken,
          currency,
          this.options.language,
        ),
        bookingToken: query.bookingToken,
        airline: { name: "Unknown", iataCode: null },
        carrier: "Unknown",
        flightNumber: query.flightNumber ?? "",
        origin: origin ?? "",
        destination: destination ?? "",
        originAirport: { code: origin ?? "", name: null, cityName: null, terminal: null },
        destinationAirport: {
          code: destination ?? "",
          name: null,
          cityName: null,
          terminal: null,
        },
        departureAt: departureDate ? `${departureDate}T00:00:00` : new Date().toISOString(),
        arrivalAt: departureDate ? `${departureDate}T00:00:00` : new Date().toISOString(),
        cabin: query.cabinClass ?? "economy",
        cabinLabel: null,
        durationMinutes: 0,
        transit: "direct",
        stops: 0,
        baggage: [],
        price: { amount: 0, currency, isEstimate: true },
        slices: [],
      };
    }

    return null;
  }

  private buildFallbackBookingOptions(
    offer: FlightOffer,
    bookingToken: string | undefined,
    currency: string,
    language: string,
  ): FlightBookingOption[] {
    // Never surface a synthetic "Google Flights" row — users expect airline / OTA
    // vendors. Soft fallback keeps a single airline (or generic) deep link only.
    const bookingUrl =
      bookingToken != null && bookingToken.length > 0
        ? buildBookingDeepLink(bookingToken, currency, language)
        : offer.deepLinkUrl ||
          buildDeepLink(
            {
              origin: offer.origin || "XXX",
              destination: offer.destination || "YYY",
              departureDate: offer.departureAt.slice(0, 10),
            },
            currency,
            language,
          );

    if (!bookingUrl) return [];

    const agency =
      offer.airline.name && offer.airline.name !== "Unknown"
        ? offer.airline.name
        : "Airline";
    return [
      {
        id: `airline-${offer.airline.iataCode ?? agency}`,
        agency,
        agencyCode: offer.airline.iataCode,
        price: {
          amount: offer.price.amount,
          currency: offer.price.currency || currency,
          isEstimate: offer.price.isEstimate,
        },
        bookingUrl,
        isAirlineDirect: true,
        fareName: offer.cabinLabel ?? offer.cabin,
        logoUrl: null,
      },
    ];
  }
}

function matchOffer(offers: FlightOffer[], query: FlightOfferDetailQuery): FlightOffer | null {
  if (query.providerRef) {
    const byRef = offers.find((o) => o.providerRef === query.providerRef);
    if (byRef) return byRef;
  }
  if (query.flightNumber) {
    const want = normalizeFlightNumber(query.flightNumber);
    const byFn = offers.find((o) => normalizeFlightNumber(o.flightNumber) === want);
    if (byFn) return byFn;
  }
  if (query.bookingToken) {
    const byToken = offers.find((o) => o.bookingToken === query.bookingToken);
    if (byToken) return byToken;
  }
  return null;
}

function normalizeFlightNumber(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

export function createGoogleFlightsProvider(env: Env): FlightProvider {
  return new GoogleFlightsProvider({
    currency: (env.secrets.googleFlightsCurrency ?? "USD").toUpperCase(),
    language: env.secrets.googleFlightsLanguage ?? "en",
  });
}
