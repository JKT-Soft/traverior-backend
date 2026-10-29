import type { CacheStore } from "../../../shared/cache/index.js";
import { cacheKey, getOrSet } from "../../../shared/cache/index.js";
import type {
  FlightOffer,
  FlightOfferDetail,
  FlightOfferDetailQuery,
  FlightProvider,
  FlightSearchQuery,
} from "../domain/ports.js";

export type FlightServiceOptions = {
  cache?: CacheStore;
  ttlSeconds?: number;
};

export class FlightService {
  private readonly cache?: CacheStore;
  private readonly ttlSeconds: number;

  constructor(
    private readonly provider: FlightProvider,
    options: FlightServiceOptions = {},
  ) {
    this.cache = options.cache;
    this.ttlSeconds = options.ttlSeconds ?? 900;
  }

  search(query: FlightSearchQuery): Promise<FlightOffer[]> {
    return getOrSet(
      {
        cache: this.cache,
        key: cacheKey("flights:search", { provider: this.provider.name, query }),
        ttlSeconds: this.ttlSeconds,
      },
      () => this.provider.searchFlights(query),
    );
  }

  getOffer(offerId: string): Promise<FlightOffer | null> {
    if (!this.provider.getOffer) return Promise.resolve(null);
    return getOrSet(
      {
        cache: this.cache,
        key: cacheKey("flights:offer", { provider: this.provider.name, offerId }),
        ttlSeconds: this.ttlSeconds,
      },
      () => this.provider.getOffer!(offerId),
    );
  }

  async getOfferDetail(query: FlightOfferDetailQuery): Promise<FlightOfferDetail | null> {
    if (this.provider.getOfferDetail) {
      // Do not cache offer-detail: Playwright vendor capture is expensive to get
      // wrong (empty → soft fallback) and booking links expire quickly.
      return this.provider.getOfferDetail(query);
    }

    // Fallback for providers without native detail: resolve offer + single booking link.
    return this.resolveDetailFallback(query);
  }

  private async resolveDetailFallback(
    query: FlightOfferDetailQuery,
  ): Promise<FlightOfferDetail | null> {
    let offer: FlightOffer | null = null;
    if (query.providerRef && this.provider.getOffer) {
      offer = await this.getOffer(query.providerRef);
    }
    if (
      !offer &&
      query.origin &&
      query.destination &&
      query.departureDate
    ) {
      const offers = await this.search({
        origin: query.origin,
        destination: query.destination,
        departureDate: query.departureDate,
        returnDate: query.returnDate,
        adults: query.adults,
        cabinClass: query.cabinClass,
      });
      offer =
        offers.find((item) => item.providerRef === query.providerRef) ??
        offers.find(
          (item) =>
            query.flightNumber &&
            item.flightNumber.replace(/\s+/g, "").toUpperCase() ===
              query.flightNumber.replace(/\s+/g, "").toUpperCase(),
        ) ??
        offers[0] ??
        null;
    }
    if (!offer) return null;
    const bookingUrl = offer.deepLinkUrl;
    return {
      offer,
      bookingOptions: bookingUrl
        ? [
            {
              id: `${offer.provider}-primary`,
              agency: offer.provider === "aviasales" ? "Aviasales" : offer.airline.name,
              agencyCode: offer.airline.iataCode,
              price: offer.price,
              bookingUrl,
              isAirlineDirect: offer.provider !== "aviasales",
              fareName: offer.cabinLabel,
              logoUrl: null,
            },
          ]
        : [],
    };
  }

  get providerName(): string {
    return this.provider.name;
  }
}
