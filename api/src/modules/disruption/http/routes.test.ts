import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDisruptionRoutes } from "./routes.js";
import { buildTestApp, injectJson } from "../../../test/helpers.js";
import type { DisruptionMonitorService } from "../application/service.js";

const VALID_TRIP_ID = "11111111-1111-4111-8111-111111111111";
const VALID_ALERT_ID = "22222222-2222-4222-8222-222222222222";

describe("createDisruptionRoutes", () => {
  const mockService = {
    listAlerts: async () => [
      {
        id: VALID_ALERT_ID,
        tripId: VALID_TRIP_ID,
        stopId: null,
        kind: "weather",
        severity: "warning",
        title: "Bad weather warning",
        body: "Rain expected",
        payload: null,
        isRead: false,
        createdAt: new Date().toISOString(),
      },
    ],
    checkTrip: async () => ({
      tripId: VALID_TRIP_ID,
      scannedStops: 3,
      detectedCount: 1,
      newAlertsCount: 1,
      alerts: [],
    }),
    markAlertRead: async () => ({
      id: VALID_ALERT_ID,
      tripId: VALID_TRIP_ID,
      stopId: null,
      kind: "weather",
      severity: "warning",
      title: "Bad weather warning",
      body: "Rain expected",
      payload: null,
      isRead: true,
      createdAt: new Date().toISOString(),
    }),
    markAllAlertsRead: async () => ({ count: 1 }),
    checkAllActiveTrips: async () => [
      {
        tripId: VALID_TRIP_ID,
        scannedStops: 3,
        detectedCount: 1,
        newAlertsCount: 1,
        alerts: [],
      },
    ],
  } as unknown as DisruptionMonitorService;

  it("lists trip alerts with authenticated user", async () => {
    const app = await buildTestApp(createDisruptionRoutes(mockService), {
      user: { uid: "test-user" },
    });

    const res = await injectJson(app, "GET", `/${VALID_TRIP_ID}/alerts`);
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.ok, true);
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].id, VALID_ALERT_ID);
    await app.close();
  });

  it("triggers manual disruption check for a trip", async () => {
    const app = await buildTestApp(createDisruptionRoutes(mockService), {
      user: { uid: "test-user" },
    });

    const res = await injectJson(app, "POST", `/${VALID_TRIP_ID}/alerts/check`);
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.ok, true);
    assert.equal(body.data.scannedStops, 3);
    assert.equal(body.data.detectedCount, 1);
    await app.close();
  });

  it("marks a specific alert as read", async () => {
    const app = await buildTestApp(createDisruptionRoutes(mockService), {
      user: { uid: "test-user" },
    });

    const res = await injectJson(
      app,
      "PATCH",
      `/${VALID_TRIP_ID}/alerts/${VALID_ALERT_ID}/read`,
    );
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.ok, true);
    assert.equal(body.data.isRead, true);
    await app.close();
  });

  it("marks all alerts for a trip as read", async () => {
    const app = await buildTestApp(createDisruptionRoutes(mockService), {
      user: { uid: "test-user" },
    });

    const res = await injectJson(
      app,
      "POST",
      `/${VALID_TRIP_ID}/alerts/read-all`,
    );
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.ok, true);
    assert.equal(body.data.count, 1);
    await app.close();
  });

  it("triggers check across all active trips via /monitor/run", async () => {
    const app = await buildTestApp(createDisruptionRoutes(mockService), {
      user: { uid: "test-user" },
    });

    const res = await injectJson(app, "POST", "/monitor/run");
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.ok, true);
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].tripId, VALID_TRIP_ID);
    await app.close();
  });

  it("rejects unauthenticated requests with 401", async () => {
    const app = await buildTestApp(createDisruptionRoutes(mockService));

    const res = await injectJson(app, "GET", `/${VALID_TRIP_ID}/alerts`);
    assert.equal(res.statusCode, 401);
    await app.close();
  });
});
