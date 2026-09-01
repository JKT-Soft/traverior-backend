import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  apiSrc,
  errorResult,
  importApi,
  jsonResult,
  runMcpServer,
} from "./runtime.js";

describe("apiSrc / importApi", () => {
  it("resolves into services/api/src", () => {
    const resolved = apiSrc("config/env.ts");
    assert.match(resolved.replace(/\\/g, "/"), /services\/api\/src\/config\/env\.ts$/);
  });

  it("dynamically imports an API module", async () => {
    const envMod = await importApi<{ loadEnv: (s?: NodeJS.ProcessEnv) => { authMode: string } }>(
      "config/env.ts",
    );
    assert.equal(envMod.loadEnv({ AUTH_MODE: "dev" }).authMode, "dev");
  });
});

describe("jsonResult / errorResult", () => {
  it("wraps successful payloads", () => {
    const result = jsonResult({ a: 1 });
    const body = JSON.parse(result.content[0]!.text) as {
      ok: boolean;
      data: { a: number };
      fetchedAt: string;
    };
    assert.equal(body.ok, true);
    assert.deepEqual(body.data, { a: 1 });
    assert.ok(body.fetchedAt);
  });

  it("serializes Error and non-Error failures", () => {
    const fromError = errorResult(new Error("boom"));
    assert.equal(fromError.isError, true);
    assert.equal(JSON.parse(fromError.content[0]!.text).error, "boom");

    const fromString = errorResult("nope");
    assert.equal(JSON.parse(fromString.content[0]!.text).error, "nope");
  });
});

describe("runMcpServer", () => {
  it("registers tools, connects transport, and logs ready", async () => {
    const logs: string[] = [];
    let connected = false;
    let registered = false;

    await runMcpServer(
      "mcp-test",
      async () => {
        registered = true;
      },
      {
        createServer: () =>
          ({
            connect: async () => {
              connected = true;
            },
          }) as never,
        createTransport: () => ({
          connect: async () => undefined,
        }),
        log: (message) => logs.push(message),
      },
    );

    assert.equal(registered, true);
    assert.equal(connected, true);
    assert.match(logs[0] ?? "", /mcp-test/);
  });

  it("uses default McpServer and console logger", async () => {
    const errors: string[] = [];
    const original = console.error;
    console.error = ((message?: unknown) => {
      errors.push(String(message));
    }) as typeof console.error;

    try {
      await runMcpServer("mcp-default", async () => undefined, {
        createTransport: () => ({
          start: async () => undefined,
          send: async () => undefined,
          close: async () => undefined,
        }),
      });
    } finally {
      console.error = original;
    }

    assert.match(errors.join("\n"), /mcp-default/);
  });

  it("uses default StdioServerTransport when createTransport omitted", async () => {
    let seen: unknown;
    await runMcpServer("mcp-stdio-default", async () => undefined, {
      createServer: () =>
        ({
          connect: async (transport: unknown) => {
            seen = transport;
          },
        }) as never,
    });
    assert.ok(seen instanceof StdioServerTransport);
  });
});
