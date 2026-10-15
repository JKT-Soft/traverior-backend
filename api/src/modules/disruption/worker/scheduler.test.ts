import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { startDisruptionMonitorWorker } from "./scheduler.js";
import type { DisruptionMonitorService } from "../application/service.js";

describe("startDisruptionMonitorWorker", () => {
  it("starts periodic worker, executes runOnce, and stops cleanly", async () => {
    let checkCount = 0;
    const mockService = {
      checkAllActiveTrips: async () => {
        checkCount++;
        return [
          {
            tripId: "trip-1",
            scannedStops: 2,
            detectedCount: 1,
            newAlertsCount: 1,
            alerts: [],
          },
        ];
      },
    } as unknown as DisruptionMonitorService;

    const logged: string[] = [];
    const mockLogger = {
      info: (msg: string) => logged.push(msg),
      error: (msg: string) => logged.push(`ERROR: ${msg}`),
      warn: (msg: string) => logged.push(`WARN: ${msg}`),
    };

    const worker = startDisruptionMonitorWorker(mockService, {
      intervalMs: 10_000,
      logger: mockLogger,
    });

    assert.equal(worker.isRunning(), true);
    assert.equal(worker.intervalMs, 10_000);

    const results = await worker.runOnce();
    assert.equal(results.length, 1);
    assert.equal(checkCount, 1);
    assert.ok(logged.some((l) => l.includes("1 disruptions detected")));

    worker.stop();
    assert.equal(worker.isRunning(), false);
  });

  it("handles errors during disruption check gracefully without throwing", async () => {
    const mockService = {
      checkAllActiveTrips: async () => {
        throw new Error("Database connection dropped");
      },
    } as unknown as DisruptionMonitorService;

    const logged: string[] = [];
    const mockLogger = {
      info: (msg: string) => logged.push(msg),
      error: (msg: string) => logged.push(`ERROR: ${msg}`),
      warn: (msg: string) => logged.push(`WARN: ${msg}`),
    };

    const worker = startDisruptionMonitorWorker(mockService, {
      intervalMs: 10_000,
      logger: mockLogger,
    });

    const results = await worker.runOnce();
    assert.deepEqual(results, []);
    assert.ok(logged.some((l) => l.includes("ERROR: [disruption-worker] error during disruption check:")));

    worker.stop();
  });
});
