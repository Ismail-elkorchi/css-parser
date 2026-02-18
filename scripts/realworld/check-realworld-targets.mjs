import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { writeJson } from "../eval/eval-primitives.mjs";

function toBoolean(value) {
  return value === true;
}

async function readJson(path) {
  const source = await readFile(path, "utf8");
  return JSON.parse(source);
}

function makeCheck(id, ok, observed, expected) {
  return {
    id,
    ok: toBoolean(ok),
    observed,
    expected
  };
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

async function main() {
  const reportPath = resolve(process.cwd(), "realworld/reports/bench-realworld.json");
  const selectorReportPath = resolve(process.cwd(), "realworld/reports/bench-selectors.json");
  const targetsPath = resolve(process.cwd(), "realworld/targets.json");
  const report = await readJson(reportPath);
  const selectorReport = await readJson(selectorReportPath);
  const targets = await readJson(targetsPath);

  const thresholds = targets.thresholds ?? {};
  const selectorThresholds = targets.selectorThresholds ?? {};
  const checks = [];

  checks.push(
    makeCheck(
      "manifest-hash-match",
      report.sourceManifestSha256 === targets.sourceManifestSha256,
      report.sourceManifestSha256,
      targets.sourceManifestSha256
    )
  );

  const selectedCount = Number(report.selection?.selectedCount ?? 0);
  checks.push(
    makeCheck(
      "selected-count-min",
      isFiniteNumber(selectedCount) && selectedCount >= Number(thresholds.minSelectedCount),
      selectedCount,
      { minSelectedCount: Number(thresholds.minSelectedCount) }
    )
  );

  const kindCounts = report.coverage?.kindCounts ?? {};
  const requiredKinds = Array.isArray(thresholds.requiredKinds) ? thresholds.requiredKinds : [];
  checks.push(
    makeCheck(
      "required-kinds-present",
      requiredKinds.every((kind) => Number(kindCounts[kind] ?? 0) > 0),
      kindCounts,
      { requiredKinds }
    )
  );

  const requiredKindMinimums = thresholds.requiredKindMinimums && typeof thresholds.requiredKindMinimums === "object"
    ? thresholds.requiredKindMinimums
    : {};
  checks.push(
    makeCheck(
      "required-kind-minimums",
      Object.entries(requiredKindMinimums).every(([kind, minimum]) => Number(kindCounts[kind] ?? 0) >= Number(minimum)),
      kindCounts,
      { requiredKindMinimums }
    )
  );

  const parseMs = report.timing?.parseMs ?? {};
  const parseP95 = Number(parseMs.p95 ?? Number.NaN);
  const parseP99 = Number(parseMs.p99 ?? Number.NaN);
  const parseMax = Number(parseMs.max ?? Number.NaN);
  const maxParseP95Ms = Number(thresholds.maxParseP95Ms);
  const maxParseP99Ms = Number(thresholds.maxParseP99Ms);
  const maxParseMaxMs = Number(thresholds.maxParseMaxMs);

  checks.push(
    makeCheck(
      "parse-p95-max",
      isFiniteNumber(parseP95) && parseP95 <= maxParseP95Ms,
      parseP95,
      { maxParseP95Ms }
    )
  );
  checks.push(
    makeCheck(
      "parse-p99-max",
      isFiniteNumber(parseP99) && parseP99 <= maxParseP99Ms,
      parseP99,
      { maxParseP99Ms }
    )
  );
  checks.push(
    makeCheck(
      "parse-max-max",
      isFiniteNumber(parseMax) && parseMax <= maxParseMaxMs,
      parseMax,
      { maxParseMaxMs }
    )
  );

  const errorRate = Number(report.errors?.errorRate ?? Number.NaN);
  const maxErrorRate = Number(thresholds.maxErrorRate);
  checks.push(
    makeCheck(
      "error-rate-max",
      isFiniteNumber(errorRate) && errorRate <= maxErrorRate,
      errorRate,
      { maxErrorRate }
    )
  );

  const selectorRealworld = selectorReport.realworld ?? {};
  const selectorBenchmarks = Array.isArray(selectorReport.benchmarks) ? selectorReport.benchmarks : [];
  const fixtureSelectorBenchmark = selectorBenchmarks.find((entry) => entry?.name === "selectors-fixture") ?? null;
  const realworldSelectorBenchmark = selectorBenchmarks.find((entry) => entry?.name === "selectors-realworld") ?? null;

  checks.push(
    makeCheck(
      "selector-manifest-hash-match",
      selectorRealworld.sourceManifestSha256 === targets.sourceManifestSha256,
      selectorRealworld.sourceManifestSha256 ?? null,
      targets.sourceManifestSha256
    )
  );

  checks.push(
    makeCheck(
      "selector-realworld-available",
      selectorRealworld.available === true,
      selectorRealworld.available === true,
      true
    )
  );

  const selectorSelectedCount = Number(selectorRealworld.selectedCount ?? 0);
  const selectorMinSelectedCount = Number(selectorThresholds.minSelectedCount ?? 0);
  checks.push(
    makeCheck(
      "selector-selected-count-min",
      isFiniteNumber(selectorSelectedCount) && selectorSelectedCount >= selectorMinSelectedCount,
      selectorSelectedCount,
      { minSelectedCount: selectorMinSelectedCount }
    )
  );

  checks.push(
    makeCheck(
      "selector-selected-hash-match",
      typeof selectorRealworld.selectedHash === "string" &&
        selectorRealworld.selectedHash === selectorThresholds.selectedHash,
      selectorRealworld.selectedHash ?? null,
      selectorThresholds.selectedHash ?? null
    )
  );

  const treeTotalNodes = Number(selectorReport.tree?.totalNodes ?? 0);
  const treeElementNodes = Number(selectorReport.tree?.elementNodes ?? 0);
  const minTreeTotalNodes = Number(selectorThresholds.minTreeTotalNodes ?? 0);
  const minTreeElementNodes = Number(selectorThresholds.minTreeElementNodes ?? 0);
  checks.push(
    makeCheck(
      "selector-tree-total-nodes-min",
      isFiniteNumber(treeTotalNodes) && treeTotalNodes >= minTreeTotalNodes,
      treeTotalNodes,
      { minTreeTotalNodes }
    )
  );
  checks.push(
    makeCheck(
      "selector-tree-element-nodes-min",
      isFiniteNumber(treeElementNodes) && treeElementNodes >= minTreeElementNodes,
      treeElementNodes,
      { minTreeElementNodes }
    )
  );

  const fixtureIterations = Number(selectorReport.selection?.fixtureIterations ?? 0);
  const realworldIterations = Number(selectorReport.selection?.realworldIterations ?? 0);
  const minFixtureIterations = Number(selectorThresholds.minFixtureIterations ?? 0);
  const minRealworldIterations = Number(selectorThresholds.minRealworldIterations ?? 0);
  checks.push(
    makeCheck(
      "selector-fixture-iterations-min",
      isFiniteNumber(fixtureIterations) && fixtureIterations >= minFixtureIterations,
      fixtureIterations,
      { minFixtureIterations }
    )
  );
  checks.push(
    makeCheck(
      "selector-realworld-iterations-min",
      isFiniteNumber(realworldIterations) && realworldIterations >= minRealworldIterations,
      realworldIterations,
      { minRealworldIterations }
    )
  );

  const fixtureQueriesPerSec = Number(fixtureSelectorBenchmark?.queriesPerSec ?? Number.NaN);
  const realworldQueriesPerSec = Number(realworldSelectorBenchmark?.queriesPerSec ?? Number.NaN);
  const minFixtureQueriesPerSec = Number(selectorThresholds.minFixtureQueriesPerSec ?? 0);
  const minRealworldQueriesPerSec = Number(selectorThresholds.minRealworldQueriesPerSec ?? 0);
  checks.push(
    makeCheck(
      "selector-fixture-qps-min",
      isFiniteNumber(fixtureQueriesPerSec) && fixtureQueriesPerSec >= minFixtureQueriesPerSec,
      fixtureQueriesPerSec,
      { minFixtureQueriesPerSec }
    )
  );
  checks.push(
    makeCheck(
      "selector-realworld-qps-min",
      isFiniteNumber(realworldQueriesPerSec) && realworldQueriesPerSec >= minRealworldQueriesPerSec,
      realworldQueriesPerSec,
      { minRealworldQueriesPerSec }
    )
  );

  const fixtureMemoryRetainedMB = Number(fixtureSelectorBenchmark?.memoryRetainedMB ?? Number.NaN);
  const realworldMemoryRetainedMB = Number(realworldSelectorBenchmark?.memoryRetainedMB ?? Number.NaN);
  const maxFixtureMemoryRetainedMB = Number(selectorThresholds.maxFixtureMemoryRetainedMB ?? Number.POSITIVE_INFINITY);
  const maxRealworldMemoryRetainedMB = Number(selectorThresholds.maxRealworldMemoryRetainedMB ?? Number.POSITIVE_INFINITY);
  checks.push(
    makeCheck(
      "selector-fixture-memory-retained-max",
      isFiniteNumber(fixtureMemoryRetainedMB) && fixtureMemoryRetainedMB <= maxFixtureMemoryRetainedMB,
      fixtureMemoryRetainedMB,
      { maxFixtureMemoryRetainedMB }
    )
  );
  checks.push(
    makeCheck(
      "selector-realworld-memory-retained-max",
      isFiniteNumber(realworldMemoryRetainedMB) && realworldMemoryRetainedMB <= maxRealworldMemoryRetainedMB,
      realworldMemoryRetainedMB,
      { maxRealworldMemoryRetainedMB }
    )
  );

  const output = {
    suite: "bench-realworld-targets-check",
    timestamp: new Date().toISOString(),
    source: {
      report: "realworld/reports/bench-realworld.json",
      selectorReport: "realworld/reports/bench-selectors.json",
      targets: "realworld/targets.json"
    },
    overall: {
      ok: checks.every((entry) => entry.ok)
    },
    checks
  };

  await writeJson("realworld/reports/realworld-targets-check.json", output);

  if (!output.overall.ok) {
    const failed = checks.filter((entry) => !entry.ok).map((entry) => entry.id).join(", ");
    process.stderr.write(`realworld target check failed: ${failed}\n`);
    process.exit(1);
  }

  process.stdout.write(`realworld target check ok: checks=${String(checks.length)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`realworld target check failed: ${message}\n`);
  process.exit(1);
});
