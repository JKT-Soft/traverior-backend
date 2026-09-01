import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { AppError } from "../http/errors.js";
import { parseMcpToolPayload } from "./parse-result.js";
import { MCP_SERVER_SCRIPTS, serverForTool, TOOL_SERVER } from "./tool-registry.js";
import type { McpServerId, McpToolClient, McpToolDescriptor, McpToolResult } from "./types.js";

export type StdioMcpPoolOptions = {
  serversDir: string;
  /** Command to run MCP entry scripts (default: npx tsx) */
  runnerCommand?: string;
  runnerArgsPrefix?: string[];
  env?: Record<string, string>;
};

type Session = {
  client: Client;
  transport: StdioClientTransport;
};

/** Lazy stdio MCP connections — one child process per domain server. */
export class StdioMcpPool implements McpToolClient {
  readonly name = "stdio";
  private readonly sessions = new Map<McpServerId, Session>();
  private readonly runnerCommand: string;
  private readonly runnerArgsPrefix: string[];

  constructor(private readonly options: StdioMcpPoolOptions) {
    this.runnerCommand =
      options.runnerCommand ?? (process.platform === "win32" ? "npx.cmd" : "npx");
    this.runnerArgsPrefix = options.runnerArgsPrefix ?? ["tsx"];
  }

  async listTools(): Promise<McpToolDescriptor[]> {
    const names = Object.keys(TOOL_SERVER);
    return names.map((name) => ({
      name,
      server: serverForTool(name),
    }));
  }

  async callTool(tool: string, args: Record<string, unknown>): Promise<McpToolResult> {
    const serverId = serverForTool(tool);
    const session = await this.getSession(serverId);
    try {
      const result = await session.client.callTool({ name: tool, arguments: args });
      return parseMcpToolPayload(tool, result as { content?: { type: string; text?: string }[]; isError?: boolean });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new AppError(502, `MCP stdio call failed (${tool}): ${message}`, "MCP_STDIO_ERROR");
    }
  }

  async close(): Promise<void> {
    for (const session of this.sessions.values()) {
      try {
        await session.transport.close();
      } catch {
        /* ignore */
      }
    }
    this.sessions.clear();
  }

  private async getSession(serverId: McpServerId): Promise<Session> {
    const existing = this.sessions.get(serverId);
    if (existing) return existing;

    const script = MCP_SERVER_SCRIPTS[serverId];
    const entry = path.join(this.options.serversDir, script);
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries({ ...process.env, ...this.options.env })) {
      if (value != null) env[key] = value;
    }
    const transport = new StdioClientTransport({
      command: this.runnerCommand,
      args: [...this.runnerArgsPrefix, entry],
      cwd: this.options.serversDir,
      env,
      stderr: "pipe",
    });

    const client = new Client({ name: "traverior-api", version: "0.1.0" });
    await client.connect(transport);
    const session = { client, transport };
    this.sessions.set(serverId, session);
    return session;
  }
}
