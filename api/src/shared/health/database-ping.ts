import { healthMark, type HealthMark } from "./provider-ping.js";

export type DatabasePingClient = {
  $queryRawUnsafe<T = unknown>(query: string): Promise<T>;
};

export type DatabasePing = {
  status: "ok" | "error" | "skipped";
  ok: boolean;
  mark: HealthMark;
  ms: number;
  error?: string;
};

export const DATABASE_PING_TIMEOUT_MS = 3_000;

export async function pingDatabase(
  db: DatabasePingClient,
  options: { timeoutMs?: number; skip?: boolean } = {},
): Promise<DatabasePing> {
  if (options.skip) {
    return { status: "skipped", ok: true, mark: healthMark(true), ms: 0 };
  }

  const started = performance.now();
  let timer: NodeJS.Timeout | undefined;

  try {
    await Promise.race([
      db.$queryRawUnsafe("SELECT 1"),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Database health check timed out")),
          options.timeoutMs ?? DATABASE_PING_TIMEOUT_MS,
        );
      }),
    ]);

    return {
      status: "ok",
      ok: true,
      mark: healthMark(true),
      ms: Math.round(performance.now() - started),
    };
  } catch (error) {
    const timedOut =
      error instanceof Error && error.message === "Database health check timed out";
    return {
      status: "error",
      ok: false,
      mark: healthMark(false),
      ms: Math.round(performance.now() - started),
      error: timedOut ? "Database health check timed out" : "Database query failed",
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
