import { spawnSync } from "node:child_process";
import { mkdir, readdir, rm } from "node:fs/promises";

const release = process.argv.includes("--release");
const reports = new URL("../../reports/", import.meta.url);

await mkdir(reports, { recursive: true });
for (const entry of await readdir(reports, { withFileTypes: true })) {
  if (entry.name !== ".gitkeep") {
    await rm(new URL(entry.name, reports), { recursive: true, force: true });
  }
}

run("npm", ["run", "check:fast"]);
run("node", ["scripts/qualification/fuzz.mjs"]);
run("node", ["scripts/smoke/browser.mjs"]);
run("node", ["scripts/qualification/cross-runtime.mjs"]);
run("node", ["scripts/qualification/performance.mjs"]);
run("node", ["scripts/qualification/package.mjs"]);

if (release) {
  run("node", ["scripts/qualification/browser-oracle.mjs"]);
}

process.stdout.write(`qualification passed: ${release ? "release" : "ci"}\n`);

function run(command, arguments_) {
  const result = spawnSync(command, arguments_, { stdio: "inherit" });
  if (result.error !== undefined) throw result.error;
  if (result.signal !== null) throw new Error(`${command} terminated by ${result.signal}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
