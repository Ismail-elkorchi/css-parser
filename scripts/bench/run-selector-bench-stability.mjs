import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

import { writeJson } from "../eval/eval-primitives.mjs";

const DEFAULT_RUNS = 9;
const DEFAULT_WARMUPS = 1;

function parseIntegerArg(name, defaultValue) {
  const arg = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  if (!arg) {
    return defaultValue;
  }

  const value = Number(arg.split("=")[1]);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid --${name} value: ${String(arg)}`);
  }
  return value;
}

function runSelectorBenchOnce() {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, ["--expose-gc", "scripts/bench/run-selector-bench.mjs"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      rejectPromise(error);
    });
    child.on("close", (code) => {
      if (code !== 0) {
        rejectPromise(new Error(`selector bench run failed: code=${String(code)} stderr=${stderr.trim()}`));
        return;
      }
      resolvePromise({
        stdout,
        stderr
      });
    });
  });
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) {
    return 0;
  }
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle] ?? 0;
}

function summarize(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const medianValue = median(values);
  return {
    values,
    min,
    max,
    median: medianValue,
    spreadFraction: medianValue === 0 ? 0 : (max - min) / medianValue
  };
}

function benchmarkByName(report, name) {
  const entry = Array.isArray(report.benchmarks)
    ? report.benchmarks.find((candidate) => candidate?.name === name)
    : null;
  if (!entry) {
    throw new Error(`Missing selector benchmark entry: ${name}`);
  }
  return entry;
}

function assertStableIdentity(reference, candidate, runIndex) {
  const keys = [
    "sourceManifestSha256",
    "selectedHash",
    "selectedCount"
  ];

  for (const key of keys) {
    if ((candidate?.[key] ?? null) !== (reference?.[key] ?? null)) {
      throw new Error(`Selector benchmark identity drift for ${key} at run ${String(runIndex + 1)}`);
    }
  }
}

async function readSelectorBenchReport() {
  const reportPath = resolve(process.cwd(), "realworld/reports/bench-selectors.json");
  const source = await readFile(reportPath, "utf8");
  return JSON.parse(source);
}

async function main() {
  const runs = parseIntegerArg("runs", DEFAULT_RUNS);
  const warmups = parseIntegerArg("warmups", DEFAULT_WARMUPS);

  const fixtureQps = [];
  const realworldQps = [];
  const fixtureMemoryRetainedMB = [];
  const realworldMemoryRetainedMB = [];
  const fixtureMemoryRetainedDeltaMB = [];
  const realworldMemoryRetainedDeltaMB = [];
  let identity = null;
  let tree = null;
  let selection = null;
  let realworldMetadata = null;

  for (let runIndex = 0; runIndex < runs; runIndex += 1) {
    for (let warmupIndex = 0; warmupIndex < warmups; warmupIndex += 1) {
      await runSelectorBenchOnce();
    }

    await runSelectorBenchOnce();
    const report = await readSelectorBenchReport();
    const fixture = benchmarkByName(report, "selectors-fixture");
    const realworld = benchmarkByName(report, "selectors-realworld");

    if (!identity) {
      identity = {
        sourceManifestSha256: report.realworld?.sourceManifestSha256 ?? null,
        selectedHash: report.realworld?.selectedHash ?? null,
        selectedCount: Number(report.realworld?.selectedCount ?? 0)
      };
      tree = report.tree ?? null;
      selection = report.selection ?? null;
      realworldMetadata = report.realworld ?? null;
    } else {
      assertStableIdentity(identity, {
        sourceManifestSha256: report.realworld?.sourceManifestSha256 ?? null,
        selectedHash: report.realworld?.selectedHash ?? null,
        selectedCount: Number(report.realworld?.selectedCount ?? 0)
      }, runIndex);
    }

    fixtureQps.push(Number(fixture.queriesPerSec ?? 0));
    realworldQps.push(Number(realworld.queriesPerSec ?? 0));
    fixtureMemoryRetainedMB.push(Number(fixture.memoryRetainedMB ?? 0));
    realworldMemoryRetainedMB.push(Number(realworld.memoryRetainedMB ?? 0));
    fixtureMemoryRetainedDeltaMB.push(Number(fixture.memoryRetainedDeltaMB ?? Number.NaN));
    realworldMemoryRetainedDeltaMB.push(Number(realworld.memoryRetainedDeltaMB ?? Number.NaN));
  }

  const output = {
    suite: "bench-selectors-stability",
    timestamp: new Date().toISOString(),
    runs,
    warmupsPerRun: warmups,
    identity,
    tree,
    selection,
    realworld: realworldMetadata,
    benchmarks: {
      fixture: {
        queriesPerSec: summarize(fixtureQps),
        memoryRetainedMB: summarize(fixtureMemoryRetainedMB),
        memoryRetainedDeltaMB: summarize(fixtureMemoryRetainedDeltaMB)
      },
      realworld: {
        queriesPerSec: summarize(realworldQps),
        memoryRetainedMB: summarize(realworldMemoryRetainedMB),
        memoryRetainedDeltaMB: summarize(realworldMemoryRetainedDeltaMB)
      }
    }
  };

  await writeJson("realworld/reports/bench-selectors-stability.json", output);
  process.stdout.write(
    `selector bench stability ok: runs=${String(runs)} ` +
    `fixtureMedian=${String(output.benchmarks.fixture.queriesPerSec.median)}qps ` +
    `realworldMedian=${String(output.benchmarks.realworld.queriesPerSec.median)}qps\n`
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`selector bench stability failed: ${message}\n`);
  process.exit(1);
});
