import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pingDatabase } from "./database-ping.js";

describe("pingDatabase", () => {
  it("returns ok when SELECT 1 succeeds", async () => {
    let query = "";
    const result = await pingDatabase({
      $queryRawUnsafe: async (sql: string) => {
        query = sql;
        return [{ "?column?": 1 }];
      },
    });

    assert.equal(query, "SELECT 1");
    assert.equal(result.status, "ok");
    assert.equal(result.ok, true);
  });

  it("returns a sanitized error when the query fails", async () => {
    const result = await pingDatabase({
      $queryRawUnsafe: async () => {
        throw new Error("connection string with sensitive details");
      },
    });

    assert.equal(result.status, "error");
    assert.equal(result.error, "Database query failed");
  });

  it("times out and can be skipped", async () => {
    const db = {
      $queryRawUnsafe: async () => new Promise(() => undefined),
    };

    const timedOut = await pingDatabase(db, { timeoutMs: 1 });
    assert.equal(timedOut.error, "Database health check timed out");

    const skipped = await pingDatabase(db, { skip: true });
    assert.equal(skipped.status, "skipped");
    assert.equal(skipped.ok, true);
  });
});
