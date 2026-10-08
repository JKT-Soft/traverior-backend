import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createFileLogger, DailyLogStream, formatLogDate } from "./logger.js";

function tmpLogDir() {
  return mkdtempSync(join(tmpdir(), "traverior-logs-"));
}

describe("formatLogDate", () => {
  it("formats local calendar date with zero padding", () => {
    assert.equal(formatLogDate(new Date(2026, 0, 5, 9, 8, 7)), "2026-01-05");
    assert.equal(formatLogDate(new Date(2026, 9, 8, 23, 59, 0)), "2026-10-08");
  });
});

describe("DailyLogStream", () => {
  it("writes, rotates at midnight, ends, and destroys", async () => {
    const dir = tmpLogDir();
    try {
      let current = new Date(2026, 9, 8, 12, 0, 0);
      const stream = new DailyLogStream(dir, "app.log", () => current);

      await new Promise<void>((resolve, reject) => {
        stream.write("day-one\n", (err) => (err ? reject(err) : resolve()));
      });
      current = new Date(2026, 9, 9, 0, 15, 0);
      await new Promise<void>((resolve, reject) => {
        stream.write(Buffer.from("day-two\n"), "utf8", (err) => (err ? reject(err) : resolve()));
      });

      await new Promise<void>((resolve, reject) => {
        stream.end((err) => (err ? reject(err) : resolve()));
      });

      assert.match(readFileSync(join(dir, "2026-10-08", "app.log"), "utf8"), /day-one/);
      assert.match(readFileSync(join(dir, "2026-10-09", "app.log"), "utf8"), /day-two/);

      const idle = new DailyLogStream(dir, "idle.log", () => new Date(2026, 9, 8));
      await new Promise<void>((resolve, reject) => {
        idle.end((err) => (err ? reject(err) : resolve()));
      });

      const doomed = new DailyLogStream(dir, "destroy.log", () => new Date(2026, 9, 8));
      await new Promise<void>((resolve, reject) => {
        doomed.write("x\n", (err) => (err ? reject(err) : resolve()));
      });
      doomed.destroy();

      const broken = new DailyLogStream(dir, "broken.log", () => {
        throw new Error("clock");
      });
      await new Promise<void>((resolve, reject) => {
        broken.once("error", (err) => {
          try {
            assert.match(String(err), /clock/);
            resolve();
          } catch (caught) {
            reject(caught);
          }
        });
        broken.write("nope\n");
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("createFileLogger", () => {
  it("writes info to app.log and warn/error to error.log under today's folder", () => {
    const dir = tmpLogDir();
    const now = () => new Date(2026, 9, 8, 18, 0, 0);
    try {
      const log = createFileLogger({ dir, console: false, level: "info", now });
      log.info({ route: "/health" }, "ok");
      log.warn({ code: "VALIDATION_ERROR" }, "bad request");
      log.error({ err: new Error("boom") }, "failed");

      const dayDir = join(dir, "2026-10-08");
      const appLog = readFileSync(join(dayDir, "app.log"), "utf8");
      const errLog = readFileSync(join(dayDir, "error.log"), "utf8");

      assert.match(appLog, /"msg":"ok"/);
      assert.match(appLog, /"msg":"bad request"/);
      assert.match(appLog, /"msg":"failed"/);
      assert.match(errLog, /"msg":"bad request"/);
      assert.match(errLog, /"msg":"failed"/);
      assert.doesNotMatch(errLog, /"msg":"ok"/);
      assert.match(appLog, /"service":"traverior-api"/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("opens a new dated folder after the calendar day changes", () => {
    const dir = tmpLogDir();
    let current = new Date(2026, 9, 8, 23, 50, 0);
    try {
      const log = createFileLogger({
        dir,
        console: false,
        now: () => current,
        appFile: "app.log",
        errorFile: "error.log",
      });
      log.info("before-midnight");
      current = new Date(2026, 9, 9, 0, 5, 0);
      log.info("after-midnight");

      assert.match(readFileSync(join(dir, "2026-10-08", "app.log"), "utf8"), /before-midnight/);
      assert.match(readFileSync(join(dir, "2026-10-09", "app.log"), "utf8"), /after-midnight/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("can also echo to stdout", () => {
    const dir = tmpLogDir();
    try {
      const log = createFileLogger({
        dir,
        console: true,
        now: () => new Date(2026, 9, 8),
      });
      log.info("console-ok");
      assert.match(readFileSync(join(dir, "2026-10-08", "app.log"), "utf8"), /console-ok/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("defaults the dated folder to the current local day", () => {
    const dir = tmpLogDir();
    try {
      const log = createFileLogger({ dir, console: false });
      log.info("today-folder");
      const stamp = formatLogDate(new Date());
      assert.match(readFileSync(join(dir, stamp, "app.log"), "utf8"), /today-folder/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
