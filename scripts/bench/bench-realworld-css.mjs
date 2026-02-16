import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

import { parse } from "../../dist/mod.js";
import { sha256Bytes, writeJson } from "../eval/eval-primitives.mjs";

const TOP_LARGEST_LIMIT = 200;
const RANDOM_SAMPLE_LIMIT = 800;
const RANDOM_SEED = 0x9e3779b9;

function resolveVergeCorpusDir() {
  return resolve(
    process.env.VERGE_CORPUS_DIR
      ?? "/home/ismail-el-korchi/Documents/Projects/verge-browser/realworld/corpus"
  );
}

function createDeterministicRng(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff;
  };
}

function pickUniformSample(records, limit, seed) {
  if (records.length <= limit) {
    return records;
  }
  const rng = createDeterministicRng(seed);
  const weighted = records.map((record) => ({
    record,
    score: rng()
  }));
  weighted.sort((left, right) => left.score - right.score);
  return weighted.slice(0, limit).map((entry) => entry.record);
}

function percentile(values, fraction) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * fraction)));
  return sorted[index] ?? 0;
}

function toMillis(value) {
  return Number(value.toFixed(3));
}

function toRatio(value) {
  return Number(value.toFixed(6));
}

function mean(values) {
  if (values.length === 0) {
    return 0;
  }
  const sum = values.reduce((accumulator, value) => accumulator + value, 0);
  return sum / values.length;
}

function ratio(numerator, denominator) {
  if (denominator === 0) {
    return 0;
  }
  return numerator / denominator;
}

function parseMetadata(source) {
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

async function main() {
  const vergeCorpusDir = resolveVergeCorpusDir();
  const metadataPath = resolve(process.cwd(), "realworld/manifests/css.ndjson");
  const metadataBytes = await readFile(metadataPath);
  const metadata = parseMetadata(metadataBytes.toString("utf8"));
  if (metadata.length === 0) {
    throw new Error("realworld/manifests/css.ndjson is empty; run npm run realworld:import first");
  }

  const sortedBySize = [...metadata].sort((left, right) => right.sizeBytes - left.sizeBytes);
  const topLargest = sortedBySize.slice(0, TOP_LARGEST_LIMIT);
  const uniformSample = pickUniformSample(metadata, RANDOM_SAMPLE_LIMIT, RANDOM_SEED);

  const selectedBySha = new Map();
  for (const record of [...topLargest, ...uniformSample]) {
    selectedBySha.set(record.sha256, record);
  }
  const selected = [...selectedBySha.values()].sort((left, right) => left.sha256.localeCompare(right.sha256));
  const selectedSha256 = selected.map((entry) => entry.sha256).join("\n");
  const selectedSha256Hash = sha256Bytes(Buffer.from(selectedSha256, "utf8"));

  const cases = [];
  for (const record of selected) {
    const extension = record.kind === "style-attr" ? "decl" : "css";
    const cssPath = resolve(vergeCorpusDir, `cache/css/${record.sha256}.${extension}`);
    let cssSource;
    try {
      cssSource = await readFile(cssPath, "utf8");
    } catch {
      const fallbackPath = resolve(vergeCorpusDir, `cache/css/${record.sha256}.css`);
      cssSource = await readFile(fallbackPath, "utf8");
    }

    const startedAt = performance.now();
    const tree = parse(cssSource, {
      captureSpans: false,
      trace: false
    });
    const elapsedMs = performance.now() - startedAt;

    cases.push({
      sha256: record.sha256,
      kind: record.kind,
      sizeBytes: record.sizeBytes,
      parseTimeMs: toMillis(elapsedMs),
      parseErrorCount: tree.errors.length
    });
  }

  const parseTimes = cases.map((entry) => entry.parseTimeMs);
  const kindCounts = {};
  for (const entry of cases) {
    kindCounts[entry.kind] = (kindCounts[entry.kind] ?? 0) + 1;
  }
  const sortedKindCounts = Object.fromEntries(
    Object.keys(kindCounts).sort((left, right) => left.localeCompare(right)).map((key) => [key, kindCounts[key]])
  );
  const errorCases = cases.filter((entry) => entry.parseErrorCount > 0).length;

  const summary = {
    suite: "bench-realworld-css",
    timestamp: new Date().toISOString(),
    corpusDir: vergeCorpusDir,
    sourceManifestSha256: sha256Bytes(metadataBytes),
    runFingerprint: {
      selectedSha256Hash,
      selectionLimits: {
        topLargestLimit: TOP_LARGEST_LIMIT,
        randomSampleLimit: RANDOM_SAMPLE_LIMIT,
        randomSeed: `0x${RANDOM_SEED.toString(16)}`
      }
    },
    selection: {
      topLargestLimit: TOP_LARGEST_LIMIT,
      randomSampleLimit: RANDOM_SAMPLE_LIMIT,
      randomSeed: `0x${RANDOM_SEED.toString(16)}`,
      selectedCount: cases.length
    },
    coverage: {
      kindCounts: sortedKindCounts
    },
    timing: {
      parseMs: {
        min: toMillis(percentile(parseTimes, 0)),
        mean: toMillis(mean(parseTimes)),
        p50: toMillis(percentile(parseTimes, 0.5)),
        p95: toMillis(percentile(parseTimes, 0.95)),
        p99: toMillis(percentile(parseTimes, 0.99)),
        max: toMillis(percentile(parseTimes, 1))
      }
    },
    errors: {
      errorCases,
      totalCases: cases.length,
      errorRate: toRatio(ratio(errorCases, cases.length))
    },
    worstByParseTime: [...cases]
      .sort((left, right) => right.parseTimeMs - left.parseTimeMs)
      .slice(0, 20),
    worstBySize: [...cases]
      .sort((left, right) => right.sizeBytes - left.sizeBytes)
      .slice(0, 20),
    cases
  };

  await writeJson("realworld/reports/bench-realworld.json", summary);
  process.stdout.write(
    `realworld bench ok: selected=${String(cases.length)} p95=${String(summary.timing.parseMs.p95)}ms\n`
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`realworld bench failed: ${message}\n`);
  process.exit(1);
});
