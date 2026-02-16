import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  nowIso,
  readJson,
  writeJson,
  fileExists,
  normalizeCaseCounts,
  safeDiv,
  requireExistingDecisionRecords
} from "./eval-primitives.mjs";

function makeGate(gateId, gateName, gatePass, gateDetails) {
  return { id: gateId, name: gateName, pass: gatePass, details: gateDetails };
}

async function loadOptionalReport(reportPath) {
  if (!(await fileExists(reportPath))) {
    return null;
  }
  return await readJson(reportPath);
}

function parseProfileArg() {
  const profileArg = process.argv.find((argumentValue) => argumentValue.startsWith("--profile="));
  return profileArg ? profileArg.split("=")[1] : "ci";
}

async function evaluateConformanceGate(gates, gateId, gateName, reportPath, threshold, options = {}) {
  const report = await loadOptionalReport(reportPath);
  if (!report) {
    gates.push(makeGate(gateId, gateName, false, { missingReport: reportPath }));
    return;
  }

  const { passed, failed, skipped, total, executed } = normalizeCaseCounts(report);
  const passRate = safeDiv(passed, executed === 0 ? passed + failed : executed);
  const minPassRate = threshold.minPassRate;
  const maxSkips = threshold.maxSkips;

  const holdoutExcluded = Number(report?.holdoutExcluded ?? report?.holdout?.excluded ?? 0);
  const holdoutRule = typeof report?.holdoutRule === "string" ? report.holdoutRule : report?.holdout?.rule;
  const holdoutMod = Number(report?.holdoutMod ?? report?.holdout?.mod ?? Number.NaN);
  const totalSurface = passed + failed + skipped + holdoutExcluded;
  const holdoutExcludedFraction = safeDiv(holdoutExcluded, totalSurface);

  const enforceHoldoutDiscipline = Boolean(options.enforceHoldoutDiscipline);
  const holdoutDisciplinePass =
    !enforceHoldoutDiscipline ||
    (holdoutExcludedFraction >= 0.05 &&
      holdoutExcludedFraction <= 0.15 &&
      typeof holdoutRule === "string" &&
      Number.isFinite(holdoutMod));

  const missingDecisionRecords = await requireExistingDecisionRecords(report.skips);

  const pass =
    passRate >= minPassRate &&
    skipped <= maxSkips &&
    missingDecisionRecords.length === 0 &&
    holdoutDisciplinePass;

  gates.push(
    makeGate(gateId, gateName, pass, {
      passRate,
      minPassRate,
      passed,
      failed,
      skipped,
      total,
      holdoutExcluded,
      holdoutExcludedFraction,
      holdoutRule,
      holdoutMod,
      holdoutDisciplineRange: { min: 0.05, max: 0.15 },
      holdoutDisciplinePass,
      maxSkips,
      missingDecisionRecords
    })
  );
}

async function main() {
  const profile = parseProfileArg();

  if (!(await fileExists("evaluation.config.json"))) {
    console.error("Missing evaluation.config.json");
    process.exit(1);
  }

  const config = await readJson("evaluation.config.json");
  const profilePolicy = config.profiles?.[profile];
  if (!profilePolicy) {
    console.error(`Unknown profile: ${profile}`);
    process.exit(1);
  }

  if (!(await fileExists("package.json"))) {
    console.error("Missing package.json");
    process.exit(1);
  }
  const packageManifest = JSON.parse(await readFile("package.json", "utf8"));

  const gates = [];
  gates.push(makeGate("G-000", "Evaluation config exists", true, { profile }));

  const runtimeDependencies = packageManifest.dependencies;
  const hasRuntimeDependencyObject =
    runtimeDependencies !== null &&
    typeof runtimeDependencies === "object" &&
    !Array.isArray(runtimeDependencies);
  const runtimeDependencyCount = hasRuntimeDependencyObject ? Object.keys(runtimeDependencies).length : -1;
  const hasZeroRuntimeDependencies = hasRuntimeDependencyObject && runtimeDependencyCount === 0;
  gates.push(makeGate("G-010", "Zero runtime dependencies", hasZeroRuntimeDependencies, {
    dependenciesType: runtimeDependencies === undefined ? "undefined" : typeof runtimeDependencies,
    dependenciesCount: runtimeDependencyCount
  }));

  const noExternalImports = await loadOptionalReport("reports/no-external-imports.json");
  gates.push(
    makeGate(
      "G-012",
      "No external imports in dist/",
      Boolean(noExternalImports?.ok),
      noExternalImports || { missing: true }
    )
  );

  const runtimeSelfContained = await loadOptionalReport("reports/runtime-self-contained.json");
  gates.push(
    makeGate(
      "G-015",
      "Runtime self-contained",
      Boolean(runtimeSelfContained?.ok),
      runtimeSelfContained || { missing: true }
    )
  );

  const esmTypeOk = packageManifest.type === "module";
  const exportsStr = JSON.stringify(packageManifest.exports || {});
  const noRequireKeys = !exportsStr.includes('"require"');
  gates.push(
    makeGate("G-020", "ESM only", esmTypeOk && noRequireKeys, {
      type: packageManifest.type,
      requireKeysPresent: !noRequireKeys
    })
  );

  const noNodeBuiltins = await loadOptionalReport("reports/no-node-builtins.json");
  gates.push(
    makeGate(
      "G-030",
      "No Node builtin imports in src/",
      Boolean(noNodeBuiltins?.ok),
      noNodeBuiltins || { missing: true }
    )
  );

  const conformanceThresholds = config.thresholds?.conformance || {};
  await evaluateConformanceGate(
    gates,
    "G-040",
    "Conformance tokenizer",
    "reports/tokenizer.json",
    conformanceThresholds.tokenizer,
    { enforceHoldoutDiscipline: true }
  );
  await evaluateConformanceGate(
    gates,
    "G-050",
    "Conformance parser/tree",
    "reports/tree.json",
    conformanceThresholds.tree,
    { enforceHoldoutDiscipline: true }
  );
  await evaluateConformanceGate(
    gates,
    "G-060",
    "Conformance encoding",
    "reports/encoding.json",
    conformanceThresholds.encoding,
    { enforceHoldoutDiscipline: true }
  );
  await evaluateConformanceGate(
    gates,
    "G-070",
    "Conformance serializer",
    "reports/serializer.json",
    conformanceThresholds.serializer,
    { enforceHoldoutDiscipline: true }
  );

  const determinismReport = await loadOptionalReport("reports/determinism.json");
  gates.push(
    makeGate("G-080", "Determinism", Boolean(determinismReport?.overall?.ok), determinismReport || { missing: true })
  );

  const smokeReport = await loadOptionalReport("reports/smoke.json");
  const determinismThresholds = config.thresholds?.determinism || {};
  const requiredDeterminismRuntimes = Array.isArray(determinismThresholds.requiredRuntimes)
    ? determinismThresholds.requiredRuntimes
    : ["node", "deno", "bun"];
  const requireCrossRuntimeDeterminism = determinismThresholds.requireCrossRuntimeDeterminism !== false;
  const smokeDeterminism = smokeReport?.determinism || null;
  const runtimeHashes = smokeDeterminism?.hashes || {};
  const runtimesPresent = requiredDeterminismRuntimes.every((runtimeName) => typeof runtimeHashes[runtimeName] === "string");
  const runtimeHashValues = requiredDeterminismRuntimes
    .map((runtimeName) => runtimeHashes[runtimeName])
    .filter((value) => typeof value === "string");
  const hashesAgree = runtimeHashValues.length === requiredDeterminismRuntimes.length &&
    new Set(runtimeHashValues).size === 1;
  const crossRuntimeDeterminismPass = requireCrossRuntimeDeterminism
    ? Boolean(smokeDeterminism?.ok) && runtimesPresent && hashesAgree
    : true;

  gates.push(
    makeGate("G-081", "Cross-runtime determinism agreement", crossRuntimeDeterminismPass, {
      required: requireCrossRuntimeDeterminism,
      requiredRuntimes: requiredDeterminismRuntimes,
      hashes: runtimeHashes,
      runtimesPresent,
      hashesAgree
    })
  );

  const streamReport = await loadOptionalReport("reports/stream.json");
  const requireStreamReport = Boolean(profilePolicy.requireStreamReport);
  const streamOk = Boolean(streamReport?.overall?.ok);
  const streamPass = requireStreamReport ? streamOk : (streamReport ? streamOk : true);
  gates.push(
    makeGate("G-085", "Streaming invariants", streamPass, {
      required: requireStreamReport,
      stream: streamReport || { missing: true }
    })
  );

  const agentReport = await loadOptionalReport("reports/agent.json");
  const requireAgentReport = Boolean(profilePolicy.requireAgentReport);
  const agentOk = Boolean(agentReport?.overall?.ok);
  const agentPass = requireAgentReport ? agentOk : (agentReport ? agentOk : true);
  gates.push(
    makeGate("G-086", "Agent feature report", agentPass, {
      required: requireAgentReport,
      agent: agentReport || { missing: true }
    })
  );

  let parseErrorGatePass = false;
  let parseErrorDetails = { missing: true };
  try {
    const publicModule = await import(pathToFileURL(resolve("dist/mod.js")).href);
    const parseResult = publicModule.parse("@media ( { color: red; }");
    const parseErrorIds = parseResult.errors.map((entry) => entry.parseErrorId);
    const stableSpecRefs = parseErrorIds.every(
      (parseErrorId) => publicModule.getParseErrorSpecRef(parseErrorId) === "https://drafts.csswg.org/css-syntax/#error-handling"
    );

    parseErrorGatePass =
      typeof publicModule.getParseErrorSpecRef === "function" &&
      parseErrorIds.length > 0 &&
      parseErrorIds.every((entry) => typeof entry === "string" && entry.length > 0) &&
      stableSpecRefs;

    parseErrorDetails = {
      parseErrorIds,
      stableSpecRefs
    };
  } catch (error) {
    parseErrorDetails = {
      error: error instanceof Error ? error.message : String(error)
    };
  }

  gates.push(makeGate("G-088", "Parse-error taxonomy contract", parseErrorGatePass, parseErrorDetails));

  let parseContextGatePass = false;
  let parseContextDetails = { missing: true };
  try {
    const publicModule = await import(pathToFileURL(resolve("dist/mod.js")).href);
    const ruleList = publicModule.parseRuleList(".x{color:red}");
    const declList = publicModule.parseDeclarationList("color:red;");

    parseContextGatePass =
      typeof publicModule.parseFragment === "function" &&
      typeof publicModule.parseRuleList === "function" &&
      typeof publicModule.parseDeclarationList === "function" &&
      ruleList.kind === "fragment" &&
      ruleList.context === "rule" &&
      declList.kind === "fragment" &&
      declList.context === "declarationList";

    parseContextDetails = {
      ruleContext: ruleList.context,
      declarationContext: declList.context
    };
  } catch (error) {
    parseContextDetails = {
      error: error instanceof Error ? error.message : String(error)
    };
  }

  gates.push(makeGate("G-090", "Parse-context contract", parseContextGatePass, parseContextDetails));

  const selectorReport = await loadOptionalReport("reports/selectors.json");
  const selectorGatePass = Boolean(selectorReport?.overall?.ok);
  gates.push(
    makeGate("G-091", "Selector contract and fixtures", selectorGatePass, selectorReport || { missing: true })
  );

  const smokeNodeOk = Boolean(smokeReport?.runtimes?.node?.ok);
  const smokeDenoOk = profilePolicy.requireDeno ? Boolean(smokeReport?.runtimes?.deno?.ok) : true;
  const smokeBunOk = profilePolicy.requireBun ? Boolean(smokeReport?.runtimes?.bun?.ok) : true;
  const smokePass = Boolean(smokeNodeOk && smokeDenoOk && smokeBunOk);

  gates.push(
    makeGate("G-100", "Runtime smoke", smokePass, {
      required: {
        node: true,
        deno: Boolean(profilePolicy.requireDeno),
        bun: Boolean(profilePolicy.requireBun)
      },
      runtimes: smokeReport?.runtimes || { missing: true }
    })
  );

  const browserDiffReport = await loadOptionalReport("reports/browser-diff.json");
  const requireBrowserDiff = Boolean(profilePolicy.requireBrowserDiff);
  const browserDiffOk = Boolean(browserDiffReport?.overall?.ok);
  const browserDiffPass = requireBrowserDiff ? browserDiffOk : (browserDiffReport ? browserDiffOk : true);

  gates.push(
    makeGate("G-110", "Browser differential parity", browserDiffPass, {
      required: requireBrowserDiff,
      browserDiff: browserDiffReport || { missing: true }
    })
  );

  const hardGateReport = await loadOptionalReport("reports/hard-gate.json");
  const requireHardGate = profilePolicy.requireHardGate !== false;
  const hardGateOk = Boolean(hardGateReport?.overall?.ok);
  const hardGatePass = requireHardGate ? hardGateOk : (hardGateReport ? hardGateOk : true);
  gates.push(
    makeGate("G-115", "Hard-gate evidence integrity", hardGatePass, {
      required: requireHardGate,
      hardGate: hardGateReport || { missing: true }
    })
  );

  const requireBenchStability = Boolean(profilePolicy.requireBenchStability);
  const benchStabilityReport = await loadOptionalReport("reports/bench-stability.json");
  const benchmarkStabilityThresholds = config.thresholds?.performanceStability || {};
  const minBenchStabilityRuns = Number(profilePolicy.benchStabilityRuns ?? 5);
  const maxThroughputSpreadFraction = Number(benchmarkStabilityThresholds.maxThroughputSpreadFraction ?? 0.1);
  const maxMemorySpreadFraction = Number(benchmarkStabilityThresholds.maxMemorySpreadFraction ?? 0.05);
  const requiredBenchmarkNames = Object.keys(config.performanceBaseline?.benchmarks || {}).sort((left, right) =>
    left.localeCompare(right)
  );

  let benchStabilityPass = true;
  const benchStabilityDetails = {
    required: requireBenchStability,
    minRuns: minBenchStabilityRuns,
    maxThroughputSpreadFraction,
    maxMemorySpreadFraction,
    benchmarks: {}
  };

  if (requireBenchStability) {
    if (!benchStabilityReport) {
      benchStabilityPass = false;
      benchStabilityDetails.missing = true;
    } else {
      const observedRuns = Number(benchStabilityReport.runs ?? 0);
      if (!Number.isInteger(observedRuns) || observedRuns < minBenchStabilityRuns) {
        benchStabilityPass = false;
      }
      benchStabilityDetails.runs = observedRuns;

      for (const benchmarkName of requiredBenchmarkNames) {
        const benchmarkEntry = benchStabilityReport.benchmarks?.[benchmarkName];
        const throughputSpread = Number(benchmarkEntry?.mbPerSec?.spreadFraction ?? Number.NaN);
        const memorySpread = Number(benchmarkEntry?.memoryMB?.spreadFraction ?? Number.NaN);
        const benchmarkPass =
          Number.isFinite(throughputSpread) &&
          Number.isFinite(memorySpread) &&
          throughputSpread <= maxThroughputSpreadFraction &&
          memorySpread <= maxMemorySpreadFraction;

        if (!benchmarkPass) {
          benchStabilityPass = false;
        }

        benchStabilityDetails.benchmarks[benchmarkName] = {
          throughputSpread,
          memorySpread,
          pass: benchmarkPass
        };
      }
    }
  }

  gates.push(
    makeGate("G-120", "Benchmark stability gate", benchStabilityPass, benchStabilityDetails)
  );

  const allPass = gates.every((gate) => gate.pass);

  const report = {
    suite: "gates",
    timestamp: nowIso(),
    profile,
    allPass,
    gates
  };

  await writeJson("reports/gates.json", report);

  if (!allPass) {
    console.error("Gate checks failed. See reports/gates.json");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
