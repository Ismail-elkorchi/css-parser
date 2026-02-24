import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { extractInlineRenderSignals, extractRenderSignals } from "../../dist/mod.js";

const TOP_LARGEST_LIMIT = 200;
const RANDOM_SAMPLE_LIMIT = 800;
const RANDOM_SEED = "css-render-signals-v2";

function hashSeed(seedText) {
  let hash = 2166136261;
  for (let index = 0; index < seedText.length; index += 1) {
    hash ^= seedText.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
    hash >>>= 0;
  }
  return hash === 0 ? 1 : hash;
}

function xorshift32(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

function resolveVergeCorpusDir() {
  return resolve(process.env.VERGE_CORPUS_DIR ?? "/home/ismail-el-korchi/Documents/Projects/verge-browser/realworld/corpus");
}

async function readNdjson(path) {
  const source = await readFile(path, "utf8");
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

function selectRecords(records) {
  const sorted = [...records].sort((left, right) => {
    if (right.sizeBytes !== left.sizeBytes) {
      return right.sizeBytes - left.sizeBytes;
    }
    return left.sha256.localeCompare(right.sha256);
  });

  const topLargest = sorted.slice(0, TOP_LARGEST_LIMIT);
  const rest = sorted.slice(TOP_LARGEST_LIMIT);
  const random = xorshift32(hashSeed(RANDOM_SEED));
  const shuffled = [...rest];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const pick = Math.floor(random() * (index + 1));
    const current = shuffled[index];
    shuffled[index] = shuffled[pick];
    shuffled[pick] = current;
  }

  const sampled = shuffled.slice(0, RANDOM_SAMPLE_LIMIT);
  const selected = [...topLargest, ...sampled].sort((left, right) => left.sha256.localeCompare(right.sha256));
  return {
    selected,
    topLargestCount: topLargest.length,
    randomSampleCount: sampled.length
  };
}

function fixed6(value) {
  return Number(value.toFixed(6));
}

async function readCssPayload(vergeCorpusDir, record) {
  const extensionCandidates = record.kind === "style-attr" ? ["decl", "css"] : ["css", "decl"];
  for (const extension of extensionCandidates) {
    const path = resolve(vergeCorpusDir, `cache/css/${record.sha256}.${extension}`);
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }
  throw new Error(`missing css payload for ${record.sha256}`);
}

function aggregateSignals(reportState, signals) {
  for (const signal of signals) {
    reportState.totalSignals += 1;
    reportState.classCounts[signal.signalClass] = (reportState.classCounts[signal.signalClass] ?? 0) + 1;
    const propertyKey = `${signal.signalClass}:${signal.property}`;
    reportState.propertyCounts[propertyKey] = (reportState.propertyCounts[propertyKey] ?? 0) + 1;
  }
}

async function main() {
  const vergeCorpusDir = resolveVergeCorpusDir();
  const manifestPath = resolve(process.cwd(), "realworld/manifests/css.ndjson");
  const reportPath = resolve(process.cwd(), "realworld/reports/css-render-signals-v2.json");

  const manifestRecords = await readNdjson(manifestPath);
  const selection = selectRecords(manifestRecords);

  const state = {
    totalSignals: 0,
    classCounts: {},
    propertyCounts: {},
    parseFailures: []
  };

  for (const record of selection.selected) {
    try {
      const cssText = await readCssPayload(vergeCorpusDir, record);
      const signals = record.kind === "style-attr"
        ? extractInlineRenderSignals(cssText)
        : extractRenderSignals(cssText);
      aggregateSignals(state, signals);
    } catch (error) {
      state.parseFailures.push({
        sha256: record.sha256,
        kind: record.kind,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const classCounts = Object.fromEntries(
    Object.entries(state.classCounts)
      .sort((left, right) => left[0].localeCompare(right[0]))
  );

  const topProperties = Object.entries(state.propertyCounts)
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return left[0].localeCompare(right[0]);
    })
    .slice(0, 20)
    .map(([property, count]) => ({ property, count }));

  const report = {
    suite: "css-render-signals-v2",
    timestamp: new Date().toISOString(),
    vergeCorpusDir,
    selection: {
      selectedCount: selection.selected.length,
      topLargestCount: selection.topLargestCount,
      randomSampleCount: selection.randomSampleCount,
      seed: RANDOM_SEED
    },
    totals: {
      signalCount: state.totalSignals,
      meanSignalsPerPayload: selection.selected.length > 0
        ? fixed6(state.totalSignals / selection.selected.length)
        : 0,
      parseFailureCount: state.parseFailures.length
    },
    classCounts,
    topProperties,
    parseFailures: state.parseFailures.slice(0, 20),
    overall: {
      ok: selection.selected.length > 0 && state.totalSignals > 0
    }
  };

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (!report.overall.ok) {
    throw new Error("css render signal report failed");
  }

  process.stdout.write(
    `css-render-signals-v2 ok: selected=${String(selection.selected.length)} signals=${String(state.totalSignals)} failures=${String(state.parseFailures.length)}\n`
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`css-render-signals-v2 failed: ${message}\n`);
  process.exit(1);
});
