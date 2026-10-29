import type { Env } from "../../../config/env.js";
import type { FlightOffer, FlightProvider, FlightSearchQuery } from "../domain/ports.js";
import {
  mapAviasalesOffer,
  type AviasalesPriceTicket,
} from "./map-aviasales-offer.js";

const PRICES_FOR_DATES_URL = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates";

type AviasalesPricesResponse = {
  success?: boolean;
  data?: AviasalesPriceTicket[] | Record<string, never>;
  error?: string | null;
  currency?: string;
};

/**
 * Aviasales (Travelpayouts) Data API adapter — swap via PROVIDER_FLIGHTS=aviasales.
 * Uses cached price search history (estimate), not live GDS inventory.
 */
export class AviasalesFlightProvider implements FlightProvider {
  readonly name = "aviasales";

  constructor(
    private readonly token: string,
    private readonly options: {
      currency: string;
      market?: string;
      marker?: string;
      limit?: number;
    } = { currency: "usd" },
  ) {}

  async searchFlights(query: FlightSearchQuery): Promise<FlightOffer[]> {
    const params = new URLSearchParams({
      origin: query.origin.toUpperCase(),
      destination: query.destination.toUpperCase(),
      departure_at: query.departureDate,
      one_way: query.returnDate ? "false" : "true",
      direct: "false",
      sorting: "price",
      unique: "false",
      currency: this.options.currency,
      limit: String(this.options.limit ?? 30),
      page: "1",
      token: this.token,
    });

    if (query.returnDate) {
      params.set("return_at", query.returnDate);
    }
    if (this.options.market) {
      params.set("market", this.options.market);
    }

    const res = await fetch(`${PRICES_FOR_DATES_URL}?${params.toString()}`, {
      method: "GET",
      headers: {
        "X-Access-Token": this.token,
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Aviasales search failed (${res.status}): ${text}`);
    }

    const json = (await res.json()) as AviasalesPricesResponse;
    if (json.success === false) {
      throw new Error(`Aviasales search failed: ${json.error ?? "unknown error"}`);
    }

    const tickets = Array.isArray(json.data) ? json.data : [];
    const currency = (json.currency ?? this.options.currency).toUpperCase();

    return tickets
      .slice(0, 10)
      .map((ticket) =>
        mapAviasalesOffer(ticket, query, this.name, {
          currency,
          marker: this.options.marker,
        }),
      );
  }
}

export function createAviasalesFlightProvider(env: Env): FlightProvider {
  const token = env.secrets.travelpayoutsToken;
  if (!token) {
    throw new Error("TRAVELPAYOUTS_TOKEN required for PROVIDER_FLIGHTS=aviasales");
  }
  return new AviasalesFlightProvider(token, {
    currency: (env.secrets.travelpayoutsCurrency ?? "usd").toLowerCase(),
    market: env.secrets.travelpayoutsMarket,
    marker: env.secrets.travelpayoutsMarker,
  });
}
