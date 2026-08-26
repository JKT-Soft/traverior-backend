import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

type ToolHandler = (args: never) => Promise<unknown>;

export type FakeTool = {
  name: string;
  description: string;
  schema: unknown;
  handler: ToolHandler;
};

export function createFakeMcpServer() {
  const tools: FakeTool[] = [];
  const server = {
    tool(
      name: string,
      description: string,
      schema: unknown,
      handler: ToolHandler,
    ) {
      tools.push({ name, description, schema, handler });
    },
  } as unknown as McpServer;

  return {
    server,
    tools,
    async call(name: string, args: unknown = {}) {
      const tool = tools.find((t) => t.name === name);
      if (!tool) throw new Error(`Missing tool ${name}`);
      return tool.handler(args as never);
    },
  };
}

export function parseToolPayload(result: {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}) {
  const text = result.content[0]?.text ?? "{}";
  return JSON.parse(text) as { ok: boolean; data?: unknown; error?: string };
}
