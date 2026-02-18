import { fileExists, nowIso, readJson, safeDiv, writeJson } from "./eval-primitives.mjs";

const REQUIRED_HOLDOUT_RULE = "hash(id) % 10 === 0";
const REQUIRED_HOLDOUT_MOD = 10;

const REQUIRED_AGENT_FEATURES = [
  "trace",
  "spans",
  "patch",
  "outline",
  "chunk",
  "streamToken",
  "parseErrorId",
  "selectors"
];

const REQUIRED_STREAM_CHECKS = [
  "stream-equivalent-to-bytes",
  "stream-max-input-bytes-aborts"
];

const REQUIRED_SMOKE_CHECKS = [
  "parse",
  "serialize",
  "parseBytes",
  "parseFragment",
  "parseStream",
  "tokenize"
];

function parseProfileArg() {
  const profileArg = process.argv.find((argumentValue) => argumentValue.startsWith("--profile="));
  return profileArg ? profileArg.split("=")[1] : "ci";
}

function makeCheck(id, ok, details) {
  return { id, ok, details };
}

function getNumber(value, fallback = 0) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function checkConformanceSuite(report, suiteName, minTotal, checks) {
  const total = getNumber(report?.cases?.total);
  const passed = getNumber(report?.cases?.passed);
  const failed = getNumber(report?.cases?.failed);
  const skipped = getNumber(report?.cases?.skipped);
  const holdoutExcluded = getNumber(report?.holdoutExcluded, getNumber(report?.holdout?.excluded));
  const holdoutRule = typeof report?.holdoutRule === "string" ? report.holdoutRule : report?.holdout?.rule;
  const holdoutMod = getNumber(report?.holdoutMod, getNumber(report?.holdout?.mod, Number.NaN));
  const executed = passed + failed;
  const totalSurface = executed + skipped + holdoutExcluded;
  const holdoutExcludedFraction = safeDiv(holdoutExcluded, totalSurface);

  const surfaceOk = total >= minTotal && total === executed + skipped;
  const holdoutDisciplineOk =
    holdoutRule === REQUIRED_HOLDOUT_RULE &&
    holdoutMod === REQUIRED_HOLDOUT_MOD &&
    holdoutExcluded > 0 &&
    holdoutExcludedFraction >= 0.05 &&
    holdoutExcludedFraction <= 0.15;
  const strictOutcomeOk = failed === 0 && skipped === 0;

  checks.push(
    makeCheck(`conformance-${suiteName}-surface`, surfaceOk, {
      total,
      minTotal,
      passed,
      failed,
      skipped,
      executed
    })
  );
  checks.push(
    makeCheck(`conformance-${suiteName}-holdout`, holdoutDisciplineOk, {
      holdoutExcluded,
      holdoutRule,
      holdoutMod,
      holdoutExcludedFraction,
      expectedRule: REQUIRED_HOLDOUT_RULE,
      expectedMod: REQUIRED_HOLDOUT_MOD
    })
  );
  checks.push(
    makeCheck(`conformance-${suiteName}-strict-outcome`, strictOutcomeOk, {
      passed,
      failed,
      skipped
    })
  );
}

function checkDeterminism(determinismReport, checks) {
  const cases = Array.isArray(determinismReport?.cases) ? determinismReport.cases : [];
  const hashPattern = /^sha256:[a-f0-9]{64}$/u;

  const caseCoverageOk = cases.length >= 2;
  const caseStatusOk = cases.every((entry) => entry?.ok === true);
  const hashShapeOk = cases.every((entry) => hashPattern.test(String(entry?.hashes?.hash || "")));

  checks.push(makeCheck("determinism-case-coverage", caseCoverageOk, { count: cases.length, minCases: 2 }));
  checks.push(makeCheck("determinism-case-status", caseStatusOk, { cases }));
  checks.push(makeCheck("determinism-hash-shape", hashShapeOk, { hashPattern: String(hashPattern) }));
}

function checkStream(streamReport, checks) {
  const streamChecks = Array.isArray(streamReport?.checks) ? streamReport.checks : [];
  const streamCheckMap = new Map(streamChecks.map((entry) => [entry.id, Boolean(entry?.ok)]));

  for (const requiredCheckId of REQUIRED_STREAM_CHECKS) {
    checks.push(
      makeCheck(`stream-${requiredCheckId}`, streamCheckMap.get(requiredCheckId) === true, {
        requiredCheckId,
        observed: streamCheckMap.get(requiredCheckId) ?? false
      })
    );
  }
}

function checkAgent(agentReport, checks) {
  for (const featureName of REQUIRED_AGENT_FEATURES) {
    checks.push(
      makeCheck(`agent-${featureName}`, agentReport?.features?.[featureName]?.ok === true, {
        featureName,
        feature: agentReport?.features?.[featureName] || null
      })
    );
  }
}

function checkSmoke(smokeReport, checks) {
  for (const runtimeName of ["node", "deno", "bun"]) {
    const runtimeReport = smokeReport?.runtimes?.[runtimeName] || null;
    const runtimeOk = runtimeReport?.ok === true;
    checks.push(makeCheck(`smoke-${runtimeName}-status`, runtimeOk, { runtime: runtimeName, runtimeReport }));

    for (const smokeCheckName of REQUIRED_SMOKE_CHECKS) {
      checks.push(
        makeCheck(
          `smoke-${runtimeName}-${smokeCheckName}`,
          runtimeReport?.checks?.[smokeCheckName] === true,
          {
            runtime: runtimeName,
            check: smokeCheckName,
            observed: runtimeReport?.checks?.[smokeCheckName] ?? false
          }
        )
      );
    }
  }
}

function checkReleaseEvidence(reports, config, checks) {
  const browserDiff = reports.browserDiff;
  const browserThresholds = config?.thresholds?.browserDiff || {};

  const compared = getNumber(browserDiff?.overall?.compared, getNumber(browserDiff?.compared));
  const agreement = getNumber(browserDiff?.overall?.agreement, getNumber(browserDiff?.agreement));
  const presentEngines = Array.isArray(browserDiff?.overall?.presentEngines)
    ? browserDiff.overall.presentEngines
    : [];
  const tagCounts = browserDiff?.tagCoverage?.counts && typeof browserDiff.tagCoverage.counts === "object"
    ? browserDiff.tagCoverage.counts
    : (browserDiff?.coverage?.tagCounts && typeof browserDiff.coverage.tagCounts === "object"
      ? browserDiff.coverage.tagCounts
      : {});

  const browserCasesOk = compared >= getNumber(browserThresholds.minCases);
  const browserAgreementOk = agreement >= getNumber(browserThresholds.minAgreement);
  const browserEnginesOk = presentEngines.length >= getNumber(browserThresholds.minEnginesPresent);

  const requiredTags = Array.isArray(browserThresholds.requiredTags) ? browserThresholds.requiredTags : [];
  const minTagCoverage = getNumber(browserThresholds.minTagCoverage);
  const tagCoverageOk = requiredTags.every((tagName) => getNumber(tagCounts[tagName]) >= minTagCoverage);

  checks.push(makeCheck("release-browser-cases", browserCasesOk, {
    compared,
    minCases: browserThresholds.minCases
  }));
  checks.push(makeCheck("release-browser-agreement", browserAgreementOk, {
    agreement,
    minAgreement: browserThresholds.minAgreement
  }));
  checks.push(makeCheck("release-browser-engines", browserEnginesOk, {
    presentEngines,
    minEnginesPresent: browserThresholds.minEnginesPresent
  }));
  checks.push(makeCheck("release-browser-tag-coverage", tagCoverageOk, {
    requiredTags,
    minTagCoverage,
    tagCounts
  }));

  const fuzz = reports.fuzz;
  const fuzzRuns = getNumber(fuzz?.runs);
  const fuzzCrashes = getNumber(fuzz?.crashes);
  const fuzzHangs = getNumber(fuzz?.hangs);
  checks.push(makeCheck("release-fuzz-coverage", fuzzRuns >= 500, { runs: fuzzRuns, minRuns: 500 }));
  checks.push(makeCheck("release-fuzz-stability", fuzzCrashes === 0 && fuzzHangs === 0, {
    crashes: fuzzCrashes,
    hangs: fuzzHangs
  }));

  const benchEntries = Array.isArray(reports.bench?.benchmarks) ? reports.bench.benchmarks : [];
  const benchNames = benchEntries.map((entry) => String(entry?.name || ""));
  const requiredBenchmarks = ["parse-medium", "parse-large"];
  const benchCoverageOk = requiredBenchmarks.every((name) => benchNames.includes(name));
  const benchMetricsOk = benchEntries.every((entry) => {
    const throughput = getNumber(entry?.mbPerSec, Number.NaN);
    const memoryMb = getNumber(entry?.memoryMB, Number.NaN);
    return Number.isFinite(throughput) && throughput > 0 && Number.isFinite(memoryMb) && memoryMb >= 0;
  });
  checks.push(makeCheck("release-bench-coverage", benchCoverageOk, {
    requiredBenchmarks,
    benchNames
  }));
  checks.push(makeCheck("release-bench-metrics", benchMetricsOk, {
    benchmarkCount: benchEntries.length
  }));
}

async function main() {
  const profile = parseProfileArg();
  const config = await readJson("evaluation.config.json");
  const reports = {
    tokenizer: await readJson("reports/tokenizer.json"),
    tree: await readJson("reports/tree.json"),
    encoding: await readJson("reports/encoding.json"),
    serializer: await readJson("reports/serializer.json"),
    determinism: await readJson("reports/determinism.json"),
    stream: await readJson("reports/stream.json"),
    agent: await readJson("reports/agent.json"),
    smoke: await readJson("reports/smoke.json"),
    pack: await readJson("reports/pack.json"),
    docs: await readJson("reports/docs.json")
  };

  if (profile !== "ci") {
    reports.holdout = await readJson("reports/holdout.json");
    reports.browserDiff = await readJson("reports/browser-diff.json");
    reports.fuzz = await readJson("reports/fuzz.json");
    reports.bench = await readJson("reports/bench.json");
  }

  const checks = [];
  checkConformanceSuite(reports.tokenizer, "tokenizer", 100, checks);
  checkConformanceSuite(reports.tree, "tree", 100, checks);
  checkConformanceSuite(reports.encoding, "encoding", 50, checks);
  checkConformanceSuite(reports.serializer, "serializer", 100, checks);
  checkDeterminism(reports.determinism, checks);
  checkStream(reports.stream, checks);
  checkAgent(reports.agent, checks);
  checkSmoke(reports.smoke, checks);

  if (profile !== "ci") {
    const holdoutTotal = getNumber(reports.holdout?.cases?.total);
    const holdoutPassed = getNumber(reports.holdout?.cases?.passed);
    const holdoutFailed = getNumber(reports.holdout?.cases?.failed);
    const holdoutSkipped = getNumber(reports.holdout?.cases?.skipped);
    checks.push(
      makeCheck("release-holdout-surface", holdoutTotal >= 20, {
        total: holdoutTotal,
        minTotal: 20
      })
    );
    checks.push(
      makeCheck("release-holdout-strict-outcome", holdoutFailed === 0 && holdoutSkipped === 0, {
        passed: holdoutPassed,
        failed: holdoutFailed,
        skipped: holdoutSkipped
      })
    );

    checkReleaseEvidence(reports, config, checks);
  }

  checks.push(
    makeCheck("packaging-third-party-notices", reports.pack?.thirdPartyNoticesIncluded === true && reports.pack?.ok === true, {
      pack: reports.pack
    })
  );
  checks.push(makeCheck("docs-contract", reports.docs?.ok === true, { docs: reports.docs }));
  checks.push(
    makeCheck("docs-hard-gate-policy", await fileExists("docs/phase1-hard-gates.md"), {
      requiredPath: "docs/phase1-hard-gates.md"
    })
  );
  checks.push(
    makeCheck("docs-hard-gate-adr", await fileExists("docs/decisions/ADR-007-phase1-hard-gate-build.md"), {
      requiredPath: "docs/decisions/ADR-007-phase1-hard-gate-build.md"
    })
  );

  const failedChecks = checks.filter((entry) => !entry.ok);
  const overallOk = failedChecks.length === 0;

  await writeJson("reports/hard-gate.json", {
    suite: "hard-gate",
    timestamp: nowIso(),
    profile,
    overall: {
      ok: overallOk,
      failedChecks: failedChecks.map((entry) => entry.id)
    },
    checks
  });

  if (!overallOk) {
    console.error("Hard-gate checks failed. See reports/hard-gate.json");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
