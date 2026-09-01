import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type ImportApi = <T>(relativeFromApiSrc: string) => Promise<T>;

/** Resolve a file under api/src */
export function apiSrc(relativeFromApiSrc: string): string {
  return path.resolve(__dirname, "../../../api/src", relativeFromApiSrc);
}

export async function importApi<T>(relativeFromApiSrc: string): Promise<T> {
  const href = pathToFileURL(apiSrc(relativeFromApiSrc)).href;
  // Dynamic import interop creates an instrumented branch that is not meaningfully testable.
  /* c8 ignore next */
  return (await import(href)) as T;
}

export function jsonResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ ok: true, data, fetchedAt: new Date().toISOString() }, null, 2),
      },
    ],
  };
}

export function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true as const,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ ok: false, error: message }),
      },
    ],
  };
}

export type McpTransport = {
  start?: () => Promise<void>;
  send?: (message: unknown) => Promise<void>;
  close?: () => Promise<void>;
  connect?: (server: McpServer) => Promise<void>;
};

export async function runMcpServer(
  name: string,
  register: (server: McpServer) => void | Promise<void>,
  options: {
    createServer?: (name: string) => McpServer;
    createTransport?: () => McpTransport;
    log?: (message: string) => void;
  } = {},
): Promise<void> {
  const server =
    options.createServer?.(name) ?? new McpServer({ name, version: "0.1.0" });
  await register(server);
  const transport = options.createTransport?.() ?? new StdioServerTransport();
  await server.connect(transport as never);
  (options.log ?? ((m) => console.error(m)))(`[${name}] MCP server ready (stdio)`);
}
