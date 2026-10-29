import { Prisma, type PrismaClient, type TripAlert } from "@prisma/client";
import { prisma as defaultPrisma } from "../../../infra/prisma/client.js";
import { NotFoundError } from "../../../shared/http/errors.js";
import type { WeatherService } from "../../weather/application/service.js";
import type {
  CheckTripResult,
  DisruptionCandidate,
  ListAlertsFilter,
  SerializedTripAlert,
} from "../domain/types.js";

export type DisruptionDb = Pick<PrismaClient, "trip" | "stop" | "tripAlert">;

export type DisruptionMonitorServiceOptions = {
  db?: DisruptionDb;
  weather?: WeatherService;
  now?: () => Date;
  dedupWindowHours?: number;
};

export function serializeTripAlert(alert: TripAlert): SerializedTripAlert {
  return {
    id: alert.id,
    tripId: alert.tripId,
    stopId: alert.stopId,
    kind: alert.kind,
    severity: alert.severity,
    title: alert.title,
    body: alert.body,
    payload: (alert.payload as Record<string, unknown> | null) ?? null,
    isRead: alert.isRead,
    createdAt: alert.createdAt.toISOString(),
  };
}

const SEVERE_WEATHER_KEYWORDS =
  /badai|petir|thunderstorm|hujan lebat|heavy rain|hujan badai|typhoon|cyclone|tornado|flood|banjir|blizzard|gale|extreme/i;

const CRITICAL_WEATHER_KEYWORDS =
  /typhoon|tornado|cyclone|badai dahsyat|banjir bandang|extreme storm|tsunami/i;

export class DisruptionMonitorService {
  private readonly db: DisruptionDb;
  private readonly weather?: WeatherService;
  private readonly now: () => Date;
  private readonly dedupWindowHours: number;

  constructor(options: DisruptionMonitorServiceOptions = {}) {
    this.db = options.db ?? defaultPrisma;
    this.weather = options.weather;
    this.now = options.now ?? (() => new Date());
    this.dedupWindowHours = options.dedupWindowHours ?? 24;
  }

  /**
   * Scans a specific trip for delays, severe weather, and cancellations.
   * Discovered disruptions are deduplicated against existing alerts within dedupWindowHours.
   */
  async checkTrip(tripId: string): Promise<CheckTripResult> {
    const trip = await this.db.trip.findUnique({
      where: { id: tripId },
      include: {
        journey: {
          include: {
            stops: {
              where: { deletedAt: null },
              include: {
                bookings: {
                  include: {
                    flight: true,
                    hotel: true,
                    event: true,
                  },
                },
              },
              orderBy: { sortOrder: "asc" },
            },
          },
        },
      },
    });

    if (!trip) {
      throw new NotFoundError(`Trip ${tripId} not found`);
    }

    const stops = trip.journey?.stops ?? [];
    const candidates: DisruptionCandidate[] = [];

    for (const stop of stops) {
      // 1. Scan for cancellations
      this.detectCancellations(tripId, stop, candidates);

      // 2. Scan for delays
      this.detectDelays(tripId, stop, candidates);

      // 3. Scan for severe weather
      await this.detectSevereWeather(tripId, stop, candidates);
    }

    // Deduplicate and persist new alerts
    const windowStart = new Date(
      this.now().getTime() - this.dedupWindowHours * 60 * 60 * 1000,
    );

    const createdAlerts: SerializedTripAlert[] = [];

    for (const candidate of candidates) {
      const existing = await this.db.tripAlert.findFirst({
        where: {
          tripId: candidate.tripId,
          stopId: candidate.stopId ?? null,
          kind: candidate.kind,
          title: candidate.title,
          createdAt: { gte: windowStart },
        },
      });

      if (!existing) {
        const created = await this.db.tripAlert.create({
          data: {
            tripId: candidate.tripId,
            stopId: candidate.stopId ?? null,
            kind: candidate.kind,
            severity: candidate.severity,
            title: candidate.title,
            body: candidate.body,
            payload: candidate.payload
              ? (candidate.payload as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          },
        });
        createdAlerts.push(serializeTripAlert(created));
      }
    }

    // Load recent alerts for this trip (both existing recent and newly created)
    const recentAlerts = await this.db.tripAlert.findMany({
      where: { tripId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return {
      tripId,
      scannedStops: stops.length,
      detectedCount: candidates.length,
      newAlertsCount: createdAlerts.length,
      alerts: recentAlerts.map(serializeTripAlert),
    };
  }

  /**
   * Scans all active or planning trips for disruptions.
   */
  async checkAllActiveTrips(): Promise<CheckTripResult[]> {
    const activeTrips = await this.db.trip.findMany({
      where: {
        status: { in: ["planning", "ready", "active"] },
      },
      select: { id: true },
    });

    const results: CheckTripResult[] = [];
    for (const trip of activeTrips) {
      try {
        const result = await this.checkTrip(trip.id);
        results.push(result);
      } catch (err) {
        // Continue scanning remaining trips even if one fails
        console.error(`[disruption-monitor] Error checking trip ${trip.id}:`, err);
      }
    }

    return results;
  }

  /**
   * List alerts for a trip with optional filtering.
   */
  async listAlerts(
    tripId: string,
    filter: ListAlertsFilter = {},
  ): Promise<SerializedTripAlert[]> {
    const alerts = await this.db.tripAlert.findMany({
      where: {
        tripId,
        ...(filter.unreadOnly ? { isRead: false } : {}),
        ...(filter.kind ? { kind: filter.kind } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: filter.limit ?? 100,
    });

    return alerts.map(serializeTripAlert);
  }

  /**
   * Mark a single alert as read.
   */
  async markAlertRead(tripId: string, alertId: string): Promise<SerializedTripAlert> {
    const alert = await this.db.tripAlert.findFirst({
      where: { id: alertId, tripId },
    });

    if (!alert) {
      throw new NotFoundError(`Alert ${alertId} not found on trip ${tripId}`);
    }

    const updated = await this.db.tripAlert.update({
      where: { id: alertId },
      data: { isRead: true },
    });

    return serializeTripAlert(updated);
  }

  /**
   * Mark all alerts for a trip as read.
   */
  async markAllAlertsRead(tripId: string): Promise<{ count: number }> {
    const updated = await this.db.tripAlert.updateMany({
      where: { tripId, isRead: false },
      data: { isRead: true },
    });

    return { count: updated.count };
  }

  // --- Internal Disruption Detection Helpers ---

  private detectCancellations(
    tripId: string,
    stop: {
      id: string;
      name: string;
      subtitle: string | null;
      status: string;
      bookings: Array<{
        flight: {
          id: string;
          airlineName: string | null;
          flightNumber: string | null;
          originIata: string;
          destinationIata: string;
          raw: unknown;
        } | null;
        hotel: { id: string; name: string; raw: unknown } | null;
        event: { id: string; name: string; raw: unknown } | null;
      }>;
    },
    candidates: DisruptionCandidate[],
  ): void {
    // Stop level skipped/cancelled
    if (
      stop.status === "skipped" &&
      (stop.subtitle?.toLowerCase().includes("batal") ||
        stop.subtitle?.toLowerCase().includes("cancel"))
    ) {
      candidates.push({
        tripId,
        stopId: stop.id,
        kind: "cancel",
        severity: "critical",
        title: `Stop cancelled: ${stop.name}`,
        body: stop.subtitle ?? `The schedule at ${stop.name} was cancelled or skipped.`,
        payload: { stopId: stop.id, name: stop.name },
      });
    }

    for (const booking of stop.bookings) {
      // Flight cancellation
      if (booking.flight) {
        const raw = booking.flight.raw as Record<string, unknown> | null;
        const isCancelled =
          raw?.status === "cancelled" ||
          raw?.isCancelled === true ||
          raw?.cancelled === true;

        if (isCancelled) {
          const airline =
            booking.flight.airlineName ?? booking.flight.flightNumber ?? "Flight";
          candidates.push({
            tripId,
            stopId: stop.id,
            kind: "cancel",
            severity: "critical",
            title: `Flight cancelled: ${airline}`,
            body: `Flight ${
              booking.flight.flightNumber ? booking.flight.flightNumber + " " : ""
            }from ${booking.flight.originIata} to ${
              booking.flight.destinationIata
            } was cancelled by the airline.`,
            payload: {
              stopId: stop.id,
              flightId: booking.flight.id,
              flightNumber: booking.flight.flightNumber,
              originIata: booking.flight.originIata,
              destinationIata: booking.flight.destinationIata,
            },
          });
        }
      }

      // Hotel cancellation
      if (booking.hotel) {
        const raw = booking.hotel.raw as Record<string, unknown> | null;
        const isCancelled =
          raw?.status === "cancelled" ||
          raw?.isCancelled === true ||
          raw?.cancelled === true;

        if (isCancelled) {
          candidates.push({
            tripId,
            stopId: stop.id,
            kind: "cancel",
            severity: "critical",
            title: `Hotel reservation cancelled: ${booking.hotel.name}`,
            body: `The stay at ${booking.hotel.name} was cancelled.`,
            payload: {
              stopId: stop.id,
              hotelId: booking.hotel.id,
              hotelName: booking.hotel.name,
            },
          });
        }
      }

      // Event cancellation
      if (booking.event) {
        const raw = booking.event.raw as Record<string, unknown> | null;
        const isCancelled =
          raw?.status === "cancelled" ||
          raw?.isCancelled === true ||
          raw?.cancelled === true;

        if (isCancelled) {
          candidates.push({
            tripId,
            stopId: stop.id,
            kind: "cancel",
            severity: "critical",
            title: `Event cancelled: ${booking.event.name}`,
            body: `${booking.event.name} was cancelled by the organizer.`,
            payload: {
              stopId: stop.id,
              eventId: booking.event.id,
              eventName: booking.event.name,
            },
          });
        }
      }
    }
  }

  private detectDelays(
    tripId: string,
    stop: {
      id: string;
      name: string;
      kind: string;
      status: string;
      bookings: Array<{
        flight: {
          id: string;
          airlineName: string | null;
          flightNumber: string | null;
          originIata: string;
          destinationIata: string;
          raw: unknown;
        } | null;
      }>;
    },
    candidates: DisruptionCandidate[],
  ): void {
    let flightDelayed = false;

    for (const booking of stop.bookings) {
      if (booking.flight) {
        const raw = booking.flight.raw as Record<string, unknown> | null;
        const delayMinutes =
          typeof raw?.delayMinutes === "number"
            ? raw.delayMinutes
            : raw?.status === "delayed"
              ? typeof raw?.delay === "number"
                ? raw.delay
                : 45
              : 0;

        if (delayMinutes > 0) {
          flightDelayed = true;
          const severity = delayMinutes >= 120 ? "critical" : "warning";
          const airline =
            booking.flight.airlineName ?? booking.flight.flightNumber ?? "Flight";

          candidates.push({
            tripId,
            stopId: stop.id,
            kind: "delay",
            severity,
            title: `Flight delayed: ${airline} (${delayMinutes} min)`,
            body: `Flight ${
              booking.flight.flightNumber ? booking.flight.flightNumber + " " : ""
            }from ${booking.flight.originIata} to ${
              booking.flight.destinationIata
            } is about ${delayMinutes} minutes behind schedule.`,
            payload: {
              stopId: stop.id,
              flightId: booking.flight.id,
              flightNumber: booking.flight.flightNumber,
              delayMinutes,
            },
          });
        }
      }
    }

    // Stop status disrupted fallback
    if (!flightDelayed && stop.status === "disrupted") {
      candidates.push({
        tripId,
        stopId: stop.id,
        kind: "delay",
        severity: "warning",
        title: `Schedule disrupted at ${stop.name}`,
        body: `Travel at ${stop.name} is disrupted. Check the latest time estimate.`,
        payload: { stopId: stop.id, name: stop.name, status: stop.status },
      });
    }
  }

  private async detectSevereWeather(
    tripId: string,
    stop: {
      id: string;
      name: string;
      locationLat: number | null;
      locationLng: number | null;
    },
    candidates: DisruptionCandidate[],
  ): Promise<void> {
    if (!this.weather || stop.locationLat == null || stop.locationLng == null) {
      return;
    }

    try {
      const forecast = await this.weather.getForecast({
        lat: stop.locationLat,
        lon: stop.locationLng,
      });

      let weatherAlertEmitted = false;

      // 1. Check official weather alerts
      if (forecast.alerts && forecast.alerts.length > 0) {
        for (const alert of forecast.alerts) {
          const isCritical =
            CRITICAL_WEATHER_KEYWORDS.test(alert.event) ||
            CRITICAL_WEATHER_KEYWORDS.test(alert.description);

          candidates.push({
            tripId,
            stopId: stop.id,
            kind: "weather",
            severity: isCritical ? "critical" : "warning",
            title: `Severe weather alert in ${stop.name}: ${alert.event}`,
            body:
              alert.description ||
              `A weather alert may affect plans in ${stop.name}.`,
            payload: {
              stopId: stop.id,
              location: stop.name,
              event: alert.event,
              start: alert.start,
              end: alert.end,
            },
          });
          weatherAlertEmitted = true;
        }
      }

      // 2. Check daily summaries for severe weather forecast
      if (!weatherAlertEmitted && forecast.daily && forecast.daily.length > 0) {
        for (const day of forecast.daily.slice(0, 3)) {
          if (day.summary && SEVERE_WEATHER_KEYWORDS.test(day.summary)) {
            candidates.push({
              tripId,
              stopId: stop.id,
              kind: "weather",
              severity: "warning",
              title: `Severe forecast in ${stop.name} (${day.date})`,
              body: `The forecast may affect plans: ${day.summary}. Temperature ${day.minC}°C–${day.maxC}°C.`,
              payload: {
                stopId: stop.id,
                location: stop.name,
                date: day.date,
                summary: day.summary,
                minC: day.minC,
                maxC: day.maxC,
              },
            });
            break; // One summary alert per stop is sufficient
          }
        }
      }
    } catch (err) {
      // Gracefully handle provider errors without crashing check
      console.warn(
        `[disruption-monitor] Failed fetching weather for stop ${stop.id}:`,
        err,
      );
    }
  }
}
