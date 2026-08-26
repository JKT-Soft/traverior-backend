import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createFileLogger } from "./logger.js";

describe("createFileLogger", () => {
  it("writes info to app.log and warn/error to error.log", () => {
    const dir = mkdtempSync(join(tmpdir(), "traverior-logs-"));
    try {
      const log = createFileLogger({ dir, console: false, level: "info" });
      log.info({ route: "/health" }, "ok");
      log.warn({ code: "VALIDATION_ERROR" }, "bad request");
      log.error({ err: new Error("boom") }, "failed");

      const appLog = readFileSync(join(dir, "app.log"), "utf8");
      const errLog = readFileSync(join(dir, "error.log"), "utf8");

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
});
