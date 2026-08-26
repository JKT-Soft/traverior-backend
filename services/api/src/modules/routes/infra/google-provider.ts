import type { Env } from "../../../config/env.js";
import type { RouteProvider, RouteQuery, RouteResult } from "../domain/ports.js";

export class GoogleRouteProvider implements RouteProvider {
  readonly name = "google_routes";

  constructor(private readonly apiKey: string) {}

  async getRoute(query: RouteQuery): Promise<RouteResult> {
    const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.legs.steps.navigationInstruction",
      },
      body: JSON.stringify({
        origin: {
          location: {
            latLng: { latitude: query.originLat, longitude: query.originLng },
          },
        },
        destination: {
          location: {
            latLng: {
              latitude: query.destinationLat,
              longitude: query.destinationLng,
            },
          },
        },
        travelMode: query.mode ?? "TRANSIT",
        languageCode: query.languageCode ?? "id",
      }),
    });

    if (!res.ok) {
      throw new Error(`Google Routes failed (${res.status}): ${await res.text()}`);
    }

    const json = (await res.json()) as {
      routes?: Array<{
        duration?: string;
        distanceMeters?: number;
        legs?: Array<{
          steps?: Array<{ navigationInstruction?: { instructions?: string } }>;
        }>;
      }>;
    };

    const route = json.routes?.[0];
    const durationSec = Number((route?.duration ?? "0s").replace("s", "")) || 0;
    const steps =
      route?.legs?.[0]?.steps
        ?.map((s) => s.navigationInstruction?.instructions)
        .filter((x): x is string => Boolean(x))
        .slice(0, 8) ?? [];

    return {
      contentType: "route",
      provider: this.name,
      fetchedAt: new Date().toISOString(),
      mode: query.mode ?? "TRANSIT",
      durationMinutes: Math.round(durationSec / 60),
      distanceMeters: route?.distanceMeters ?? 0,
      stepsSummary: steps,
    };
  }
}

export function createGoogleRouteProvider(env: Env): RouteProvider {
  const key = env.secrets.googleMapsApiKey;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY required for PROVIDER_ROUTES=google");
  return new GoogleRouteProvider(key);
}
