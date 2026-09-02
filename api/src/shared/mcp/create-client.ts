import path from "node:path";
import type { Env } from "../../config/env.js";
import { InProcessMcpClient } from "./in-process-client.js";
import { StdioMcpPool } from "./stdio-pool.js";
import type { McpDomainServices, McpToolClient } from "./types.js";

export function defaultMcpServersDir(): string {
  return path.resolve(process.cwd(), "../mcp");
}

export function createMcpClient(env: Env, services: McpDomainServices): McpToolClient {
  if (env.mcp.mode === "stdio") {
    console.log(`[traverior-api:mcp] stdio mode → ${env.mcp.serversDir}`);
    return new StdioMcpPool({
      serversDir: env.mcp.serversDir,
      runnerCommand: env.mcp.runnerCommand,
      runnerArgsPrefix: env.mcp.runnerArgsPrefix,
    });
  }

  if ((process.env.MCP_MODE ?? "").toLowerCase() === "stdio") {
    console.warn(
      "[traverior-api:mcp] MCP_MODE=stdio ignored in production; using inprocess. " +
        "Set MCP_ALLOW_STDIO_IN_PRODUCTION=true to spawn MCP child processes.",
    );
  }

  return new InProcessMcpClient(services);
}
