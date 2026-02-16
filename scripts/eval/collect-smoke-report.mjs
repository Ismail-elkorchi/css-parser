import { readFile } from "node:fs/promises";

import { nowIso, writeJson } from "./eval-primitives.mjs";
import { buildSmokeReport } from "./smoke-report-core.mjs";

const RUNTIME_REPORTS = {
  node: "reports/smoke-node.json",
  deno: "reports/smoke-deno.json",
  bun: "reports/smoke-bun.json"
};

async function readRuntimeReport(path) {
  try {
    const rawText = await readFile(path, "utf8");
    return JSON.parse(rawText);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function main() {
  const runtimes = {};
  for (const [runtime, path] of Object.entries(RUNTIME_REPORTS)) {
    const report = await readRuntimeReport(path);
    if (report === null) {
      runtimes[runtime] = {
        suite: "smoke-runtime",
        runtime,
        ok: false,
        missing: true
      };
      continue;
    }
    runtimes[runtime] = report;
  }

  const smokeReport = buildSmokeReport(runtimes);

  await writeJson("reports/smoke.json", {
    suite: "smoke",
    timestamp: nowIso(),
    ...smokeReport
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
