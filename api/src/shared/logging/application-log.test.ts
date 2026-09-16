import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../http/errors.js";
import { ApplicationLogService } from "./application-log.js";
import {
  APPLICATION_LOG_STATUS,
  APPLICATION_LOG_TYPE,
} from "./application-log-types.js";

describe("ApplicationLogService", () => {
  it("records start, progress, and completion", async () => {
    const creates: Array<Record<string, unknown>> = [];
    const updates: Array<Record<string, unknown>> = [];
    const logs = new ApplicationLogService({
      applicationLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          creates.push(data);
          return { id: "log-1" };
        },
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          return {};
        },
      } as never,
    });

    const log = await logs.start({
      type: APPLICATION_LOG_TYPE.PLAN_PROCESS,
      source: "journey.planTrip",
      payload: { prompt: "Japan" },
    });
    await log?.progress({ message: "Skeleton generated", payload: { skeleton: {} } });
    await log?.complete({ result: { ok: true } });

    assert.equal(creates[0]?.type, APPLICATION_LOG_TYPE.PLAN_PROCESS);
    assert.equal(updates[0]?.message, "Skeleton generated");
    assert.equal(updates[1]?.status, APPLICATION_LOG_STATUS.COMPLETED);
    assert.deepEqual(updates[1]?.result, { ok: true });
  });

  it("records typed errors without throwing when error logging fails", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const logs = new ApplicationLogService({
      applicationLog: {
        create: async () => ({ id: "log-1" }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          if (updates.length > 1) throw new Error("database unavailable");
          return {};
        },
      } as never,
    });

    const log = await logs.start({ type: APPLICATION_LOG_TYPE.BACKGROUND_JOB });
    await log?.fail(new AppError(502, "Provider failed", "PROVIDER_ERROR"));
    await log?.fail(new Error("Second failure"));

    assert.equal(updates[0]?.status, APPLICATION_LOG_STATUS.FAILED);
    assert.equal(updates[0]?.level, "error");
  });

  it("returns no handle when the database delegate is unavailable", async () => {
    const logs = new ApplicationLogService({});
    assert.equal(
      await logs.start({ type: APPLICATION_LOG_TYPE.GENERAL }),
      undefined,
    );
  });
});
