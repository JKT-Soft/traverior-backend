import type { McpToolResult } from "./types.js";

type McpContentBlock = { type: string; text?: string };

export function parseMcpToolPayload(
  tool: string,
  result: { content?: McpContentBlock[]; isError?: boolean },
): McpToolResult {
  const text = result.content?.find((c) => c.type === "text")?.text ?? "{}";
  let parsed: { ok?: boolean; data?: unknown; error?: string; fetchedAt?: string };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    return {
      ok: false,
      tool,
      error: result.isError ? text : "MCP tool returned non-JSON",
    };
  }

  if (result.isError || parsed.ok === false) {
    return {
      ok: false,
      tool,
      error: parsed.error ?? text,
      data: parsed.data,
    };
  }

  return {
    ok: true,
    tool,
    data: parsed.data,
    fetchedAt: parsed.fetchedAt,
  };
}
