import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DisruptionMonitorService } from "./service.js";
import type { WeatherForecast, WeatherProvider } from "../../weather/domain/ports.js";
import { WeatherService } from "../../weather/application/service.js";

function makeMockWeatherService(forecastOverrides: Partial<WeatherForecast> = {}) {
  const provider: WeatherProvider = {
    name: "mock-weather",
    getForecast: async () => ({
      provider: "mock",
      cached: false,
      contentType: "weather",
      daily: [
        {
          date: "2026-10-02",
          minC: 18,
          maxC: 24,
          summary: "Hujan badai disertai petir lebat",
        },
      ],
      alerts: [],
      ...forecastOverrides,
    }),
  };
  return new WeatherService(provider);
}

describe("DisruptionMonitorService", () => {
  it("detects flight delays and assigns proper severity based on delay length", async () => {
    const alertsInDb: Array<{
      id: string;
      tripId: string;
      stopId: string | null;
      kind: string;
      severity: "info" | "warning" | "critical";
      title: string;
      body: string;
      payload: unknown;
      isRead: boolean;
      createdAt: Date;
    }> = [];

    const mockDb = {
      trip: {
        findUnique: async () => ({
          id: "trip-1",
          journey: {
            stops: [
              {
                id: "stop-delay-45",
                name: "Penerbangan CGK-KIX",
                subtitle: null,
                kind: "travel",
                status: "planned",
                locationLat: null,
                locationLng: null,
                bookings: [
                  {
                    flight: {
                      id: "flight-1",
                      airlineName: "Garuda Indonesia",
                      flightNumber: "GA882",
                      originIata: "CGK",
                      destinationIata: "KIX",
                      raw: { status: "delayed", delayMinutes: 45 },
                    },
                    hotel: null,
                    event: null,
                  },
                ],
              },
              {
                id: "stop-delay-150",
                name: "Penerbangan KIX-HND",
                subtitle: null,
                kind: "travel",
                status: "planned",
                locationLat: null,
                locationLng: null,
                bookings: [
                  {
                    flight: {
                      id: "flight-2",
                      airlineName: "ANA",
                      flightNumber: "NH382",
                      originIata: "KIX",
                      destinationIata: "HND",
                      raw: { status: "delayed", delayMinutes: 150 },
                    },
                    hotel: null,
                    event: null,
                  },
                ],
              },
            ],
          },
        }),
      },
      tripAlert: {
        findFirst: async ({ where }: { where: { title: string } }) => {
          return alertsInDb.find((a) => a.title === where.title) ?? null;
        },
        findMany: async () => alertsInDb,
        create: async ({ data }: { data: (typeof alertsInDb)[number] }) => {
          const item = {
            id: `alert-${alertsInDb.length + 1}`,
            ...data,
            isRead: false,
            createdAt: new Date(),
          };
          alertsInDb.push(item);
          return item;
        },
      },
    };

    const service = new DisruptionMonitorService({
      db: mockDb as never,
    });

    const result = await service.checkTrip("trip-1");
    assert.equal(result.detectedCount, 2);
    assert.equal(result.newAlertsCount, 2);

    const warnAlert = alertsInDb.find((a) => a.title.includes("Garuda Indonesia"));
    assert.ok(warnAlert);
    assert.equal(warnAlert?.severity, "warning");
    assert.equal(warnAlert?.kind, "delay");

    const critAlert = alertsInDb.find((a) => a.title.includes("ANA"));
    assert.ok(critAlert);
    assert.equal(critAlert?.severity, "critical");
    assert.equal(critAlert?.kind, "delay");
  });

  it("detects severe weather via WeatherService alerts and daily forecasts", async () => {
    const alertsInDb: Array<any> = [];

    const mockDb = {
      trip: {
        findUnique: async () => ({
          id: "trip-weather",
          journey: {
            stops: [
              {
                id: "stop-typhoon",
                name: "Osaka Bay Stay",
                subtitle: null,
                kind: "stay",
                status: "planned",
                locationLat: 34.6937,
                locationLng: 135.5023,
                bookings: [],
              },
            ],
          },
        }),
      },
      tripAlert: {
        findFirst: async () => null,
        findMany: async () => alertsInDb,
        create: async ({ data }: { data: any }) => {
          const item = {
            id: `alert-${alertsInDb.length + 1}`,
            ...data,
            isRead: false,
            createdAt: new Date(),
          };
          alertsInDb.push(item);
          return item;
        },
      },
    };

    const weather = makeMockWeatherService({
      alerts: [
        {
          event: "Typhoon Warning",
          description: "Peringatan badai angin kencang kategori 3 melanda pesisir Osaka.",
          start: 1791900000,
          end: 1791986400,
        },
      ],
    });

    const service = new DisruptionMonitorService({
      db: mockDb as never,
      weather,
    });

    const result = await service.checkTrip("trip-weather");
    assert.equal(result.detectedCount, 1);
    assert.equal(result.newAlertsCount, 1);

    const alert = alertsInDb[0];
    assert.equal(alert.kind, "weather");
    assert.equal(alert.severity, "critical");
    assert.ok(alert.title.includes("Typhoon Warning"));
  });

  it("detects flight, hotel, and event cancellations", async () => {
    const alertsInDb: Array<any> = [];

    const mockDb = {
      trip: {
        findUnique: async () => ({
          id: "trip-cancel",
          journey: {
            stops: [
              {
                id: "stop-1",
                name: "Tokyo Flight & Stay",
                subtitle: null,
                kind: "stay",
                status: "planned",
                locationLat: null,
                locationLng: null,
                bookings: [
                  {
                    flight: {
                      id: "fl-cancel",
                      airlineName: "Japan Airlines",
                      flightNumber: "JL726",
                      originIata: "CGK",
                      destinationIata: "NRT",
                      raw: { status: "cancelled" },
                    },
                    hotel: {
                      id: "ht-cancel",
                      name: "Shinjuku Granbell Hotel",
                      raw: { isCancelled: true },
                    },
                    event: {
                      id: "ev-cancel",
                      name: "Ghibli Museum Special Tour",
                      raw: { status: "cancelled" },
                    },
                  },
                ],
              },
            ],
          },
        }),
      },
      tripAlert: {
        findFirst: async () => null,
        findMany: async () => alertsInDb,
        create: async ({ data }: { data: any }) => {
          const item = {
            id: `alert-${alertsInDb.length + 1}`,
            ...data,
            isRead: false,
            createdAt: new Date(),
          };
          alertsInDb.push(item);
          return item;
        },
      },
    };

    const service = new DisruptionMonitorService({
      db: mockDb as never,
    });

    const result = await service.checkTrip("trip-cancel");
    assert.equal(result.detectedCount, 3);
    assert.equal(result.newAlertsCount, 3);
    assert.ok(alertsInDb.every((a) => a.kind === "cancel" && a.severity === "critical"));
  });

  it("deduplicates alerts within the dedup window", async () => {
    const alertsInDb: Array<any> = [];

    const mockDb = {
      trip: {
        findUnique: async () => ({
          id: "trip-dedup",
          journey: {
            stops: [
              {
                id: "stop-delay",
                name: "Penerbangan",
                subtitle: null,
                kind: "travel",
                status: "planned",
                locationLat: null,
                locationLng: null,
                bookings: [
                  {
                    flight: {
                      id: "fl-1",
                      airlineName: "Garuda",
                      flightNumber: "GA100",
                      originIata: "CGK",
                      destinationIata: "DPS",
                      raw: { status: "delayed", delayMinutes: 30 },
                    },
                    hotel: null,
                    event: null,
                  },
                ],
              },
            ],
          },
        }),
      },
      tripAlert: {
        findFirst: async ({ where }: { where: { title: string } }) => {
          return alertsInDb.find((a) => a.title === where.title) ?? null;
        },
        findMany: async () => alertsInDb,
        create: async ({ data }: { data: any }) => {
          const item = {
            id: `alert-${alertsInDb.length + 1}`,
            ...data,
            isRead: false,
            createdAt: new Date(),
          };
          alertsInDb.push(item);
          return item;
        },
      },
    };

    const service = new DisruptionMonitorService({
      db: mockDb as never,
    });

    // Run 1: creates 1 alert
    const run1 = await service.checkTrip("trip-dedup");
    assert.equal(run1.detectedCount, 1);
    assert.equal(run1.newAlertsCount, 1);
    assert.equal(alertsInDb.length, 1);

    // Run 2: detects disruption again, but skips inserting duplicate alert
    const run2 = await service.checkTrip("trip-dedup");
    assert.equal(run2.detectedCount, 1);
    assert.equal(run2.newAlertsCount, 0);
    assert.equal(alertsInDb.length, 1);
  });

  it("manages alert reads and list queries", async () => {
    let alertRecord = {
      id: "alert-1",
      tripId: "trip-read",
      stopId: null,
      kind: "delay",
      severity: "warning" as const,
      title: "Delayed",
      body: "Flight delayed",
      payload: null,
      isRead: false,
      createdAt: new Date(),
    };

    const mockDb = {
      tripAlert: {
        findFirst: async ({ where }: any) => {
          if (where.id === alertRecord.id && where.tripId === alertRecord.tripId) {
            return alertRecord;
          }
          return null;
        },
        findMany: async ({ where }: any) => {
          if (where.isRead === false && alertRecord.isRead) return [];
          return [alertRecord];
        },
        update: async ({ data }: any) => {
          alertRecord = { ...alertRecord, ...data };
          return alertRecord;
        },
        updateMany: async () => {
          alertRecord.isRead = true;
          return { count: 1 };
        },
      },
    };

    const service = new DisruptionMonitorService({
      db: mockDb as never,
    });

    const unreadList = await service.listAlerts("trip-read", { unreadOnly: true });
    assert.equal(unreadList.length, 1);
    assert.equal(unreadList[0].isRead, false);

    const readAlert = await service.markAlertRead("trip-read", "alert-1");
    assert.equal(readAlert.isRead, true);

    const readAllResult = await service.markAllAlertsRead("trip-read");
    assert.equal(readAllResult.count, 1);
  });
});
