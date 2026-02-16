import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

function summarizeWorst(cases, metricName, limit = 10) {
  return [...cases]
    .sort((left, right) => right[metricName] - left[metricName])
    .slice(0, limit);
}

async function main() {
  const reportPath = resolve(process.cwd(), "realworld/reports/bench-realworld.json");
  const targetsCheckPath = resolve(process.cwd(), "realworld/reports/realworld-targets-check.json");
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const targetsCheck = JSON.parse(await readFile(targetsCheckPath, "utf8"));

  const lines = [
    "# Phase 2 realworld CSS performance",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Corpus selection",
    `- corpusDir: ${report.corpusDir}`,
    `- selectedCount: ${String(report.selection.selectedCount)}`,
    `- topLargestLimit: ${String(report.selection.topLargestLimit)}`,
    `- randomSampleLimit: ${String(report.selection.randomSampleLimit)}`,
    `- randomSeed: ${report.selection.randomSeed}`,
    `- sourceManifestSha256: ${report.sourceManifestSha256}`,
    `- selectedSha256Hash: ${report.runFingerprint.selectedSha256Hash}`,
    "",
    "## Coverage",
    ...Object.entries(report.coverage.kindCounts).map(([kind, count]) => `- ${kind}: ${String(count)}`),
    "",
    "## Parse timing",
    `- min parse ms: ${String(report.timing.parseMs.min)}`,
    `- mean parse ms: ${String(report.timing.parseMs.mean)}`,
    `- p50 parse ms: ${String(report.timing.parseMs.p50)}`,
    `- p95 parse ms: ${String(report.timing.parseMs.p95)}`,
    `- p99 parse ms: ${String(report.timing.parseMs.p99)}`,
    `- max parse ms: ${String(report.timing.parseMs.max)}`,
    "",
    "## Error rate",
    `- errorCases: ${String(report.errors.errorCases)}`,
    `- totalCases: ${String(report.errors.totalCases)}`,
    `- errorRate: ${String(report.errors.errorRate)}`,
    "",
    "## Target checks",
    `- overall: ${targetsCheck.overall.ok ? "ok" : "fail"}`,
    ...targetsCheck.checks.map((check) =>
      `- ${check.id}: ${check.ok ? "ok" : "fail"} observed=${JSON.stringify(check.observed)} expected=${JSON.stringify(check.expected)}`
    ),
    "",
    "## Worst by parse time",
    ...summarizeWorst(report.cases, "parseTimeMs", 20).map((entry) =>
      `- ${entry.sha256} kind=${entry.kind} sizeBytes=${String(entry.sizeBytes)} parseTimeMs=${String(entry.parseTimeMs)} parseErrorCount=${String(entry.parseErrorCount)}`
    ),
    "",
    "## Largest payloads sampled",
    ...summarizeWorst(report.cases, "sizeBytes", 20).map((entry) =>
      `- ${entry.sha256} kind=${entry.kind} sizeBytes=${String(entry.sizeBytes)} parseTimeMs=${String(entry.parseTimeMs)} parseErrorCount=${String(entry.parseErrorCount)}`
    )
  ];

  const docPath = resolve(process.cwd(), "docs/phase2-realworld-css-performance.md");
  await writeFile(docPath, `${lines.join("\n")}\n`, "utf8");

  process.stdout.write(
    `eval:realworld ok: selected=${String(report.selection.selectedCount)} p95=${String(report.timing.parseMs.p95)}ms targets=${targetsCheck.overall.ok ? "ok" : "fail"}\n`
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`eval:realworld failed: ${message}\n`);
  process.exit(1);
});
