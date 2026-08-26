import { mkdirSync } from "node:fs";
import { join } from "node:path";
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
};

/**
 * Fastify/pino logger that writes to console + append files.
 * - logs/app.log   → info and above
 * - logs/error.log → warn and above
 */
export function createFileLogger(options: FileLoggerOptions = {}): Logger {
  const dir = options.dir ?? "logs";
  const level = options.level ?? "info";
  const appFile = options.appFile ?? "app.log";
  const errorFile = options.errorFile ?? "error.log";

  mkdirSync(dir, { recursive: true });

  const streams: StreamEntry[] = [
    {
      level: "info",
      stream: pino.destination({
        dest: join(dir, appFile),
        sync: true,
        mkdir: true,
      }),
    },
    {
      level: "warn",
      stream: pino.destination({
        dest: join(dir, errorFile),
        sync: true,
        mkdir: true,
      }),
    },
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
