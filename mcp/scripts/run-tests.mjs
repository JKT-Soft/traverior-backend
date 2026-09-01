import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "test") continue;
      files.push(...(await walk(full)));
      continue;
    }
    if (/\.test\.(ts|js)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const useTsx = flags.has("--tsx");
const watch = flags.has("--watch");
const root = resolve(args[0] ?? "src");
const preload = useTsx ? ["--import", "tsx"] : [];
const files = (await walk(root)).sort();
if (files.length === 0) {
  console.error(`No test files under ${root}`);
  process.exit(1);
}

const child = spawn(
  process.execPath,
  [...preload, "--test", ...(watch ? ["--watch"] : []), ...files],
  {
    stdio: "inherit",
    env: process.env,
  },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
