import type { Prisma, PrismaClient } from "@prisma/client";
import { AppError } from "../http/errors.js";
import {
  APPLICATION_LOG_STATUS,
  type ApplicationLogStatus,
  type ApplicationLogType,
} from "./application-log-types.js";

type ApplicationLogDelegate = Pick<
  PrismaClient["applicationLog"],
  "create" | "update"
>;

export type ApplicationLogDb = {
  applicationLog?: ApplicationLogDelegate;
};

export type StartApplicationLogInput = {
  type: ApplicationLogType;
  level?: string;
  source?: string;
  status?: ApplicationLogStatus;
  message?: string;
  userId?: string;
  tripId?: string;
  payload?: unknown;
};

export type RecordApplicationLogInput = StartApplicationLogInput & {
  result?: unknown;
  error?: unknown;
  durationMs?: number;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function errorJson(error: unknown): Prisma.InputJsonValue {
  if (error instanceof AppError) {
    return toJson({
      name: error.name,
      message: error.message,
      code: error.code,
      status: error.status,
      details: error.details,
    });
  }
  if (error instanceof Error) {
    return toJson({ name: error.name, message: error.message });
  }
  return toJson({ message: String(error) });
}

export class ApplicationLogHandle {
  constructor(
    private readonly delegate: ApplicationLogDelegate,
    private readonly id: string,
    private readonly startedAt: number,
  ) {}

  async progress(input: {
    status?: ApplicationLogStatus;
    message?: string;
    payload?: unknown;
  }): Promise<void> {
    await this.delegate
      .update({
        where: { id: this.id },
        data: {
          status: input.status,
          message: input.message,
          ...(input.payload === undefined ? {} : { payload: toJson(input.payload) }),
        },
      })
      .catch(() => undefined);
  }

  async complete(input: {
    message?: string;
    payload?: unknown;
    result?: unknown;
  } = {}): Promise<void> {
    await this.delegate
      .update({
        where: { id: this.id },
        data: {
          level: "info",
        status: APPLICATION_LOG_STATUS.COMPLETED,
          message: input.message,
          ...(input.payload === undefined ? {} : { payload: toJson(input.payload) }),
          ...(input.result === undefined ? {} : { result: toJson(input.result) }),
          durationMs: Date.now() - this.startedAt,
          completedAt: new Date(),
        },
      })
      .catch(() => undefined);
  }

  /** Logging failures must never hide the original application error. */
  async fail(error: unknown, message = "Process failed"): Promise<void> {
    await this.delegate
      .update({
        where: { id: this.id },
        data: {
          level: "error",
          status: APPLICATION_LOG_STATUS.FAILED,
          message,
          error: errorJson(error),
          durationMs: Date.now() - this.startedAt,
          completedAt: new Date(),
        },
      })
      .catch(() => undefined);
  }
}

export class ApplicationLogService {
  constructor(private readonly db: ApplicationLogDb) {}

  /** Write a standalone log event in one call. */
  async record(input: RecordApplicationLogInput): Promise<void> {
    if (!this.db.applicationLog) return;

    await this.db.applicationLog
      .create({
        data: {
          type: input.type,
          level: input.level ?? (input.error === undefined ? "info" : "error"),
          source: input.source,
          status:
            input.status ??
            (input.error === undefined
              ? APPLICATION_LOG_STATUS.COMPLETED
              : APPLICATION_LOG_STATUS.FAILED),
          message: input.message,
          userId: input.userId,
          tripId: input.tripId,
          ...(input.payload === undefined ? {} : { payload: toJson(input.payload) }),
          ...(input.result === undefined ? {} : { result: toJson(input.result) }),
          ...(input.error === undefined ? {} : { error: errorJson(input.error) }),
          durationMs: input.durationMs,
          completedAt: new Date(),
        },
      })
      .catch(() => undefined);
  }

  /** Start a multi-step process and receive a handle for progress/completion. */
  async start(
    input: StartApplicationLogInput,
  ): Promise<ApplicationLogHandle | undefined> {
    if (!this.db.applicationLog) return undefined;

    const startedAt = Date.now();
    const row = await this.db.applicationLog
      .create({
        data: {
          type: input.type,
          level: input.level ?? "info",
          source: input.source,
          status: input.status ?? APPLICATION_LOG_STATUS.STARTED,
          message: input.message,
          userId: input.userId,
          tripId: input.tripId,
          ...(input.payload === undefined ? {} : { payload: toJson(input.payload) }),
        },
        select: { id: true },
      })
      .catch(() => undefined);
    if (!row) return undefined;

    return new ApplicationLogHandle(this.db.applicationLog, row.id, startedAt);
  }
}
