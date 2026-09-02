import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export type McpRunnerConfig = {
  command: string;
  argsPrefix: string[];
};

/**
 * Resolve how to launch MCP server entry scripts.
 * Prefer `node` + local `tsx` CLI — production Docker images often lack `npx` on PATH.
 */
export function resolveMcpRunner(options?: {
  runnerCommand?: string;
  runnerArgsPrefix?: string[];
}): McpRunnerConfig {
  if (options?.runnerCommand) {
    return {
      command: options.runnerCommand,
      argsPrefix: options.runnerArgsPrefix ?? [],
    };
  }

  if (options?.runnerArgsPrefix?.length) {
    return {
      command: process.platform === "win32" ? "npx.cmd" : "npx",
      argsPrefix: options.runnerArgsPrefix,
    };
  }

  try {
    const tsxCli = require.resolve("tsx/cli");
    return {
      command: process.execPath,
      argsPrefix: [tsxCli],
    };
  } catch {
    return {
      command: process.platform === "win32" ? "npx.cmd" : "npx",
      argsPrefix: ["tsx"],
    };
  }
}
