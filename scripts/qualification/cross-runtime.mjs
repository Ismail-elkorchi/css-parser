import { spawnSync } from "node:child_process";

function run(command, arguments_) {
  const result = spawnSync(command, arguments_, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      `${command} smoke failed: ${result.stderr || result.stdout || `exit ${String(result.status)}`}`
    );
  }

  const line = result.stdout
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .findLast((entry) => entry.startsWith("{") && entry.endsWith("}"));
  if (line === undefined) throw new Error(`${command} smoke did not emit JSON`);

  const parsed = JSON.parse(line);
  if (parsed.ok !== true || parsed.snapshot === null || typeof parsed.snapshot !== "object") {
    throw new Error(`${command} smoke emitted an invalid result`);
  }
  return parsed;
}

const results = [
  run("node", ["scripts/smoke/runtime.mjs"]),
  run("deno", ["run", "--allow-read", "scripts/smoke/runtime.mjs"]),
  run("bun", ["scripts/smoke/runtime.mjs"])
];
const snapshots = results.map((result) => JSON.stringify(result.snapshot));

if (new Set(snapshots).size !== 1) {
  throw new Error(`runtime outputs differ: ${JSON.stringify(results)}`);
}

process.stdout.write("cross-runtime qualification passed\n");
