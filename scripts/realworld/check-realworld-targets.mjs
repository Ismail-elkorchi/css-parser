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
  const selectorStabilityReportPath = resolve(process.cwd(), "realworld/reports/bench-selectors-stability.json");
  const targetsPath = resolve(process.cwd(), "realworld/targets.json");
  const report = await readJson(reportPath);
  const selectorReport = await readJson(selectorReportPath);
  const selectorStabilityReport = await readJson(selectorStabilityReportPath);
  const targets = await readJson(targetsPath);

  const thresholds = targets.thresholds ?? {};
  const selectorThresholds = targets.selectorThresholds ?? {};
  const selectorStabilityThresholds = targets.selectorStabilityThresholds ?? {};
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
  const stabilityIdentity = selectorStabilityReport.identity ?? {};
  const stabilityFixture = selectorStabilityReport.benchmarks?.fixture ?? null;
  const stabilityRealworld = selectorStabilityReport.benchmarks?.realworld ?? null;

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

  const fixtureMemoryRetainedDeltaMB = Number(fixtureSelectorBenchmark?.memoryRetainedDeltaMB ?? Number.NaN);
  const realworldMemoryRetainedDeltaMB = Number(realworldSelectorBenchmark?.memoryRetainedDeltaMB ?? Number.NaN);
  const maxFixtureMemoryRetainedDeltaMB = Number(
    selectorThresholds.maxFixtureMemoryRetainedDeltaMB
      ?? selectorThresholds.maxFixtureMemoryRetainedMB
      ?? Number.POSITIVE_INFINITY
  );
  const maxRealworldMemoryRetainedDeltaMB = Number(
    selectorThresholds.maxRealworldMemoryRetainedDeltaMB
      ?? selectorThresholds.maxRealworldMemoryRetainedMB
      ?? Number.POSITIVE_INFINITY
  );
  checks.push(
    makeCheck(
      "selector-fixture-memory-retained-delta-max",
      isFiniteNumber(fixtureMemoryRetainedDeltaMB) && fixtureMemoryRetainedDeltaMB <= maxFixtureMemoryRetainedDeltaMB,
      fixtureMemoryRetainedDeltaMB,
      { maxFixtureMemoryRetainedDeltaMB }
    )
  );
  checks.push(
    makeCheck(
      "selector-realworld-memory-retained-delta-max",
      isFiniteNumber(realworldMemoryRetainedDeltaMB) &&
        realworldMemoryRetainedDeltaMB <= maxRealworldMemoryRetainedDeltaMB,
      realworldMemoryRetainedDeltaMB,
      { maxRealworldMemoryRetainedDeltaMB }
    )
  );

  const stabilityRuns = Number(selectorStabilityReport.runs ?? 0);
  const stabilityWarmupsPerRun = Number(selectorStabilityReport.warmupsPerRun ?? 0);
  const minStabilityRuns = Number(selectorStabilityThresholds.minRuns ?? 0);
  const minWarmupsPerRun = Number(selectorStabilityThresholds.minWarmupsPerRun ?? 0);
  checks.push(
    makeCheck(
      "selector-stability-runs-min",
      isFiniteNumber(stabilityRuns) && stabilityRuns >= minStabilityRuns,
      stabilityRuns,
      { minRuns: minStabilityRuns }
    )
  );
  checks.push(
    makeCheck(
      "selector-stability-warmups-min",
      isFiniteNumber(stabilityWarmupsPerRun) && stabilityWarmupsPerRun >= minWarmupsPerRun,
      stabilityWarmupsPerRun,
      { minWarmupsPerRun }
    )
  );

  checks.push(
    makeCheck(
      "selector-stability-manifest-hash-match",
      stabilityIdentity.sourceManifestSha256 === targets.sourceManifestSha256,
      stabilityIdentity.sourceManifestSha256 ?? null,
      targets.sourceManifestSha256
    )
  );
  checks.push(
    makeCheck(
      "selector-stability-selected-hash-match",
      typeof stabilityIdentity.selectedHash === "string" &&
        stabilityIdentity.selectedHash === selectorThresholds.selectedHash,
      stabilityIdentity.selectedHash ?? null,
      selectorThresholds.selectedHash ?? null
    )
  );
  checks.push(
    makeCheck(
      "selector-stability-selected-count-min",
      Number(stabilityIdentity.selectedCount ?? 0) >= Number(selectorThresholds.minSelectedCount ?? 0),
      Number(stabilityIdentity.selectedCount ?? 0),
      { minSelectedCount: Number(selectorThresholds.minSelectedCount ?? 0) }
    )
  );

  const minFixtureMedianQueriesPerSec = Number(selectorStabilityThresholds.minFixtureMedianQueriesPerSec ?? 0);
  const minRealworldMedianQueriesPerSec = Number(selectorStabilityThresholds.minRealworldMedianQueriesPerSec ?? 0);
  const maxFixtureSpreadFraction = Number(selectorStabilityThresholds.maxFixtureSpreadFraction ?? Number.POSITIVE_INFINITY);
  const maxRealworldSpreadFraction = Number(selectorStabilityThresholds.maxRealworldSpreadFraction ?? Number.POSITIVE_INFINITY);
  const maxFixtureMedianMemoryRetainedDeltaMB = Number(
    selectorStabilityThresholds.maxFixtureMedianMemoryRetainedDeltaMB
      ?? selectorStabilityThresholds.maxFixtureMedianMemoryRetainedMB
      ?? Number.POSITIVE_INFINITY
  );
  const maxRealworldMedianMemoryRetainedDeltaMB = Number(
    selectorStabilityThresholds.maxRealworldMedianMemoryRetainedDeltaMB
      ?? selectorStabilityThresholds.maxRealworldMedianMemoryRetainedMB
      ?? Number.POSITIVE_INFINITY
  );

  const fixtureMedianQps = Number(stabilityFixture?.queriesPerSec?.median ?? Number.NaN);
  const realworldMedianQps = Number(stabilityRealworld?.queriesPerSec?.median ?? Number.NaN);
  const fixtureSpreadFraction = Number(stabilityFixture?.queriesPerSec?.spreadFraction ?? Number.NaN);
  const realworldSpreadFraction = Number(stabilityRealworld?.queriesPerSec?.spreadFraction ?? Number.NaN);
  const fixtureMedianMemoryRetainedDeltaMB = Number(stabilityFixture?.memoryRetainedDeltaMB?.median ?? Number.NaN);
  const realworldMedianMemoryRetainedDeltaMB = Number(stabilityRealworld?.memoryRetainedDeltaMB?.median ?? Number.NaN);

  checks.push(
    makeCheck(
      "selector-stability-fixture-median-qps-min",
      isFiniteNumber(fixtureMedianQps) && fixtureMedianQps >= minFixtureMedianQueriesPerSec,
      fixtureMedianQps,
      { minFixtureMedianQueriesPerSec }
    )
  );
  checks.push(
    makeCheck(
      "selector-stability-realworld-median-qps-min",
      isFiniteNumber(realworldMedianQps) && realworldMedianQps >= minRealworldMedianQueriesPerSec,
      realworldMedianQps,
      { minRealworldMedianQueriesPerSec }
    )
  );
  checks.push(
    makeCheck(
      "selector-stability-fixture-spread-max",
      isFiniteNumber(fixtureSpreadFraction) && fixtureSpreadFraction <= maxFixtureSpreadFraction,
      fixtureSpreadFraction,
      { maxFixtureSpreadFraction }
    )
  );
  checks.push(
    makeCheck(
      "selector-stability-realworld-spread-max",
      isFiniteNumber(realworldSpreadFraction) && realworldSpreadFraction <= maxRealworldSpreadFraction,
      realworldSpreadFraction,
      { maxRealworldSpreadFraction }
    )
  );
  checks.push(
    makeCheck(
      "selector-stability-fixture-memory-median-delta-max",
      isFiniteNumber(fixtureMedianMemoryRetainedDeltaMB) &&
        fixtureMedianMemoryRetainedDeltaMB <= maxFixtureMedianMemoryRetainedDeltaMB,
      fixtureMedianMemoryRetainedDeltaMB,
      { maxFixtureMedianMemoryRetainedDeltaMB }
    )
  );
  checks.push(
    makeCheck(
      "selector-stability-realworld-memory-median-delta-max",
      isFiniteNumber(realworldMedianMemoryRetainedDeltaMB) &&
        realworldMedianMemoryRetainedDeltaMB <= maxRealworldMedianMemoryRetainedDeltaMB,
      realworldMedianMemoryRetainedDeltaMB,
      { maxRealworldMedianMemoryRetainedDeltaMB }
    )
  );

  const parseChecks = checks.filter((entry) => !entry.id.startsWith("selector-"));
  const selectorChecks = checks.filter((entry) => entry.id.startsWith("selector-"));
  const parseFailed = parseChecks.filter((entry) => !entry.ok).map((entry) => entry.id);
  const selectorFailed = selectorChecks.filter((entry) => !entry.ok).map((entry) => entry.id);
  const parseOk = parseFailed.length === 0;
  const selectorOk = selectorFailed.length === 0;

  const output = {
    suite: "bench-realworld-targets-check",
    timestamp: new Date().toISOString(),
    source: {
      report: "realworld/reports/bench-realworld.json",
      selectorReport: "realworld/reports/bench-selectors.json",
      selectorStabilityReport: "realworld/reports/bench-selectors-stability.json",
      targets: "realworld/targets.json"
    },
    overall: {
      ok: checks.every((entry) => entry.ok),
      parseOk,
      selectorOk
    },
    failures: {
      parse: parseFailed,
      selector: selectorFailed
    },
    checks
  };

  await writeJson("realworld/reports/realworld-targets-check.json", output);

  if (!output.overall.ok) {
    const parseFailureList = output.failures.parse.join(", ");
    const selectorFailureList = output.failures.selector.join(", ");
    process.stderr.write(
      `realworld target check failed: ` +
      `parse=[${parseFailureList}] selector=[${selectorFailureList}]\n`
    );
    process.exit(1);
  }

  process.stdout.write(`realworld target check ok: checks=${String(checks.length)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`realworld target check failed: ${message}\n`);
  process.exit(1);
});
