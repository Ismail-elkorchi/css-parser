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
  const targetsPath = resolve(process.cwd(), "realworld/targets.json");
  const report = await readJson(reportPath);
  const targets = await readJson(targetsPath);

  const thresholds = targets.thresholds ?? {};
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

  const output = {
    suite: "bench-realworld-targets-check",
    timestamp: new Date().toISOString(),
    source: {
      report: "realworld/reports/bench-realworld.json",
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
