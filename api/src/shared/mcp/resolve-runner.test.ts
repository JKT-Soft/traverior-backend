import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveMcpRunner } from "./resolve-runner.js";

describe("resolveMcpRunner", () => {
  it("honours explicit runner command", () => {
    const runner = resolveMcpRunner({
      runnerCommand: "node",
      runnerArgsPrefix: ["/tmp/tsx"],
    });
    assert.equal(runner.command, "node");
    assert.deepEqual(runner.argsPrefix, ["/tmp/tsx"]);
  });

  it("prefers node + tsx cli when available", () => {
    const runner = resolveMcpRunner();
    assert.equal(runner.command, process.execPath);
    assert.equal(runner.argsPrefix.length, 1);
    assert.match(runner.argsPrefix[0]!, /tsx/i);
  });
});
