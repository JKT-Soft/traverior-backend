import type { Env } from "../../../config/env.js";
import type { FlightOffer, FlightProvider, FlightSearchQuery } from "../domain/ports.js";
import { mapDuffelOffer, type DuffelOffer } from "./map-duffel-offer.js";

/**
 * Duffel adapter — swap in via PROVIDER_FLIGHTS=duffel.
 * Live HTTP calls stay behind this class so the rest of the monolith never imports Duffel SDK.
 */
export class DuffelFlightProvider implements FlightProvider {
  readonly name = "duffel";

  constructor(private readonly accessToken: string) {}

  async searchFlights(query: FlightSearchQuery): Promise<FlightOffer[]> {
    const passengers = Array.from({ length: query.adults ?? 1 }, () => ({
      type: "adult" as const,
    }));

    const res = await fetch(
      "https://api.duffel.com/air/offer_requests?return_offers=true",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "Duffel-Version": "v2",
        },
        body: JSON.stringify({
          data: {
            slices: [
              {
                origin: query.origin,
                destination: query.destination,
                departure_date: query.departureDate,
              },
              ...(query.returnDate
                ? [
                    {
                      origin: query.destination,
                      destination: query.origin,
                      departure_date: query.returnDate,
                    },
                  ]
                : []),
            ],
            passengers,
            cabin_class: query.cabinClass ?? "economy",
          },
        }),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Duffel search failed (${res.status}): ${text}`);
    }

    const json = (await res.json()) as { data?: { offers?: DuffelOffer[] } };
    const offers = json.data?.offers ?? [];
    return offers.slice(0, 10).map((offer) => mapDuffelOffer(offer, query, this.name));
  }
}

export function createDuffelFlightProvider(env: Env): FlightProvider {
  const token = env.secrets.duffelAccessToken;
  if (!token) throw new Error("DUFFEL_ACCESS_TOKEN required for PROVIDER_FLIGHTS=duffel");
  return new DuffelFlightProvider(token);
}
