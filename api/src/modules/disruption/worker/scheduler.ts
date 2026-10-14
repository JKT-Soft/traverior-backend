import type { DisruptionMonitorService } from "../application/service.js";
import type { CheckTripResult } from "../domain/types.js";

export type DisruptionWorkerOptions = {
  intervalMs?: number;
  runImmediately?: boolean;
  logger?: {
    info: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
  };
};

export type DisruptionWorkerHandle = {
  stop: () => void;
  isRunning: () => boolean;
  runOnce: () => Promise<CheckTripResult[]>;
  intervalMs: number;
};

export function startDisruptionMonitorWorker(
  service: DisruptionMonitorService,
  options: DisruptionWorkerOptions = {},
): DisruptionWorkerHandle {
  const intervalMs = options.intervalMs ?? 5 * 60 * 1000; // default 5 minutes
  const logger = options.logger ?? console;
  let timer: NodeJS.Timeout | null = null;
  let inFlight = false;

  const runOnce = async (): Promise<CheckTripResult[]> => {
    if (inFlight) {
      logger.info("[disruption-worker] previous check still in flight, skipping interval");
      return [];
    }

    inFlight = true;
    try {
      const results = await service.checkAllActiveTrips();
      const totalNew = results.reduce((acc, r) => acc + r.newAlertsCount, 0);
      const totalDetected = results.reduce((acc, r) => acc + r.detectedCount, 0);

      if (totalDetected > 0 || totalNew > 0) {
        logger.info(
          `[disruption-worker] checked ${results.length} trips: ${totalDetected} disruptions detected, ${totalNew} new alerts saved`,
        );
      }
      return results;
    } catch (err) {
      logger.error("[disruption-worker] error during disruption check:", err);
      return [];
    } finally {
      inFlight = false;
    }
  };

  if (options.runImmediately) {
    void runOnce();
  }

  timer = setInterval(() => {
    void runOnce();
  }, intervalMs);

  // Unref timer so node process can exit cleanly if needed
  if (timer.unref) {
    timer.unref();
  }

  return {
    stop: () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    isRunning: () => timer !== null,
    runOnce,
    intervalMs,
  };
}
