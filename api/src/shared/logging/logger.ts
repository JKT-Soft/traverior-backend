import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Writable } from "node:stream";
import pino, { type Logger, type StreamEntry } from "pino";

export type FileLoggerOptions = {
  /** Directory for log files (created if missing). Default: logs */
  dir?: string;
  /** Pino level. Default: info */
  level?: string;
  /** Also write to stdout. Default: true */
  console?: boolean;
  /** Filename for all levels >= info. Default: app.log */
  appFile?: string;
  /** Filename for warn+error. Default: error.log */
  errorFile?: string;
  /** Clock for daily folders (inject in tests). Default: local now */
  now?: () => Date;
};

/** Local calendar date as `YYYY-MM-DD` (server timezone). */
export function formatLogDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Append stream that writes under `rootDir/YYYY-MM-DD/filename`.
 * Reopens the file when the local date rolls over.
 */
export class DailyLogStream extends Writable {
  private stamp = "";
  private dest?: ReturnType<typeof pino.destination>;

  constructor(
    private readonly rootDir: string,
    private readonly filename: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    super();
  }

  private ensureOpen(): void {
    const next = formatLogDate(this.now());
    if (this.stamp === next && this.dest) return;
    this.closeDest();
    this.stamp = next;
    const dir = join(this.rootDir, next);
    mkdirSync(dir, { recursive: true });
    this.dest = pino.destination({
      dest: join(dir, this.filename),
      sync: true,
      mkdir: true,
    });
  }

  private closeDest(): void {
    if (!this.dest) return;
    try {
      this.dest.flushSync();
    } catch {
      // sonic-boom may already be closed
    }
    this.dest.end();
    this.dest = undefined;
  }

  override _write(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    try {
      this.ensureOpen();
      const enc = (encoding as string) === "buffer" || !encoding ? "utf8" : encoding;
      const data = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString(enc);
      this.dest!.write(data);
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }

  override _final(callback: (error?: Error | null) => void): void {
    try {
      this.closeDest();
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }

  override _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    try {
      this.closeDest();
      callback(error);
    } catch (caught) {
      callback(caught as Error);
    }
  }
}

/**
 * Fastify/pino logger that writes to console + daily folders:
 * - logs/YYYY-MM-DD/app.log   → info and above
 * - logs/YYYY-MM-DD/error.log → warn and above
 */
export function createFileLogger(options: FileLoggerOptions = {}): Logger {
  const dir = options.dir ?? "logs";
  const level = options.level ?? "info";
  const appFile = options.appFile ?? "app.log";
  const errorFile = options.errorFile ?? "error.log";
  const now = options.now ?? (() => new Date());

  mkdirSync(dir, { recursive: true });

  const streams: StreamEntry[] = [
    { level: "info", stream: new DailyLogStream(dir, appFile, now) },
    { level: "warn", stream: new DailyLogStream(dir, errorFile, now) },
  ];

  if (options.console !== false) {
    streams.push({ level: "info", stream: process.stdout });
  }

  return pino(
    {
      level,
      base: { service: "traverior-api" },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.multistream(streams),
  );
}
