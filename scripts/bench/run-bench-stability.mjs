import { runBenchmarks } from "./bench-core.mjs";
import { writeJson } from "../eval/eval-primitives.mjs";

const WARMUP_PER_RUN = 1;

function parseRunsArg() {
  const runArg = process.argv.find((argumentValue) => argumentValue.startsWith("--runs="));
  const parsed = Number(runArg?.split("=")[1] || 5);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid --runs value: ${String(runArg)}`);
  }
  return parsed;
}

function stats(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  return {
    values,
    min,
    max,
    median,
    spreadFraction: median === 0 ? 0 : (max - min) / median
  };
}

function summarizeRuns(runResults) {
  const benchmarkNames = [...new Set(runResults.flatMap((runResult) => runResult.map((entry) => entry.name)))];
  const benchmarks = {};

  for (const benchmarkName of benchmarkNames) {
    const mbPerSecValues = runResults.map((runResult) =>
      Number(runResult.find((entry) => entry.name === benchmarkName)?.mbPerSec || 0)
    );
    const memoryValues = runResults.map((runResult) =>
      Number(runResult.find((entry) => entry.name === benchmarkName)?.memoryMB || 0)
    );

    benchmarks[benchmarkName] = {
      mbPerSec: stats(mbPerSecValues),
      memoryMB: stats(memoryValues)
    };
  }

  return benchmarks;
}

const runs = parseRunsArg();
const runResults = [];
for (let runIndex = 0; runIndex < runs; runIndex += 1) {
  for (let warmupIndex = 0; warmupIndex < WARMUP_PER_RUN; warmupIndex += 1) {
    runBenchmarks();
  }
  runResults.push(runBenchmarks());
}

const benchmarks = summarizeRuns(runResults);
await writeJson("reports/bench-stability.json", {
  suite: "bench-stability",
  timestamp: new Date().toISOString(),
  runs,
  warmupsPerRun: WARMUP_PER_RUN,
  benchmarks
});

console.log(
  `Bench stability complete: runs=${String(runs)} warmups=${String(WARMUP_PER_RUN)} benchmarks=${String(Object.keys(benchmarks).length)}`
);
