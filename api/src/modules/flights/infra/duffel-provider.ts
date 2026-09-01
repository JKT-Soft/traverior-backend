import type { Env } from "../../../config/env.js";
import type { FlightOffer, FlightProvider, FlightSearchQuery } from "../domain/ports.js";

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

    const json = (await res.json()) as {
      data?: {
        offers?: Array<{
          id: string;
          total_amount: string;
          total_currency: string;
          slices: Array<{
            duration?: string;
            segments: Array<{
              operating_carrier?: { iata_code?: string; name?: string };
              operating_carrier_flight_number?: string;
              departing_at: string;
              arriving_at: string;
              origin: { iata_code: string };
              destination: { iata_code: string };
              passengers?: Array<{ cabin_class?: string }>;
            }>;
          }>;
        }>;
      };
    };

    const offers = json.data?.offers ?? [];
    return offers.slice(0, 10).map((offer) => {
      const segment = offer.slices[0]?.segments[0];
      return {
        contentType: "flight" as const,
        provider: this.name,
        providerRef: offer.id,
        fetchedAt: new Date().toISOString(),
        deepLinkUrl: undefined,
        carrier:
          segment?.operating_carrier?.iata_code ??
          segment?.operating_carrier?.name ??
          "Unknown",
        flightNumber: segment?.operating_carrier_flight_number ?? "",
        origin: segment?.origin.iata_code ?? query.origin,
        destination: segment?.destination.iata_code ?? query.destination,
        departureAt: segment?.departing_at ?? `${query.departureDate}T00:00:00Z`,
        arrivalAt: segment?.arriving_at ?? `${query.departureDate}T00:00:00Z`,
        cabin: segment?.passengers?.[0]?.cabin_class ?? query.cabinClass ?? "economy",
        durationMinutes: parseIsoDurationMinutes(offer.slices[0]?.duration),
        price: {
          amount: Number(offer.total_amount),
          currency: offer.total_currency,
          isEstimate: false,
        },
      };
    });
  }
}

function parseIsoDurationMinutes(duration?: string): number {
  if (!duration) return 0;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return 0;
  return Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
}

export function createDuffelFlightProvider(env: Env): FlightProvider {
  const token = env.secrets.duffelAccessToken;
  if (!token) throw new Error("DUFFEL_ACCESS_TOKEN required for PROVIDER_FLIGHTS=duffel");
  return new DuffelFlightProvider(token);
}
