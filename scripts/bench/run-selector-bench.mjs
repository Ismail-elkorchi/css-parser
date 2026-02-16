import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

import { compileSelectorList, querySelectorAll } from "../../dist/mod.js";
import { sha256Bytes, writeJson } from "../eval/eval-primitives.mjs";

const DEFAULT_VERGE_CORPUS_DIR = "/home/ismail-el-korchi/Documents/Projects/verge-browser/realworld/corpus";
const MAX_REALWORLD_RECORDS = 140;
const MAX_REALWORLD_SELECTORS = 400;
const FIXTURE_ITERATIONS = 2000;
const REALWORLD_ITERATIONS = 120;
const TREE_CLONE_FACTOR = 24;

function toMillis(value) {
  return Number(value.toFixed(3));
}

function toNumber(value, digits = 3) {
  return Number(value.toFixed(digits));
}

function parseNdjson(sourceText) {
  return sourceText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function rewriteNodeIdentity(node, suffix) {
  if (!node || typeof node !== "object") {
    return;
  }

  if (typeof node.nodeRef === "string") {
    node.nodeRef = `${node.nodeRef}-${suffix}`;
  }

  if (Array.isArray(node.attributes)) {
    for (const attribute of node.attributes) {
      if (!attribute || typeof attribute !== "object") {
        continue;
      }
      if (typeof attribute.name !== "string" || typeof attribute.value !== "string") {
        continue;
      }

      if (attribute.name.toLowerCase() === "id") {
        attribute.value = `${attribute.value}-${suffix}`;
      }
    }
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      rewriteNodeIdentity(child, suffix);
    }
  }
}

function buildSelectorStressTree(baseTree) {
  const tree = deepClone(baseTree);
  const htmlNode = Array.isArray(tree.children)
    ? tree.children.find((child) => child && typeof child === "object" && child.tagName === "html")
    : null;
  const bodyNode = htmlNode && Array.isArray(htmlNode.children)
    ? htmlNode.children.find((child) => child && typeof child === "object" && child.tagName === "body")
    : null;

  if (!bodyNode || !Array.isArray(bodyNode.children)) {
    return tree;
  }

  const templateChildren = bodyNode.children.map((child) => deepClone(child));
  const clones = [];
  for (let cloneIndex = 0; cloneIndex < TREE_CLONE_FACTOR; cloneIndex += 1) {
    for (const templateChild of templateChildren) {
      const clone = deepClone(templateChild);
      rewriteNodeIdentity(clone, `clone-${String(cloneIndex)}`);
      clones.push(clone);
    }
  }

  bodyNode.children.push(...clones);
  return tree;
}

function extractSelectorCandidates(cssSource) {
  const candidates = [];
  const preludePattern = /([^{}@][^{}]{0,240})\{/g;
  let match = preludePattern.exec(cssSource);

  while (match) {
    const rawPrelude = (match[1] ?? "").trim();
    if (rawPrelude.length > 0 && !rawPrelude.startsWith("@")) {
      const parts = rawPrelude.split(",");
      for (const rawPart of parts) {
        const selector = rawPart.trim();
        if (selector.length === 0 || selector.length > 120) {
          continue;
        }
        if (selector.includes("{") || selector.includes("}")) {
          continue;
        }
        candidates.push(selector);
      }
    }

    match = preludePattern.exec(cssSource);
  }

  return candidates;
}

function countTreeNodes(rootNode) {
  let totalNodes = 0;
  let elementNodes = 0;
  const stack = [rootNode];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== "object") {
      continue;
    }

    totalNodes += 1;
    if (typeof current.kind === "string" && current.kind.toLowerCase() === "element") {
      elementNodes += 1;
    }

    if (Array.isArray(current.children)) {
      for (let index = current.children.length - 1; index >= 0; index -= 1) {
        stack.push(current.children[index]);
      }
    }
  }

  return {
    totalNodes,
    elementNodes
  };
}

function benchmarkSelectorQueries(name, rootTree, selectors, iterations) {
  if (selectors.length === 0 || iterations <= 0) {
    return {
      name,
      selectors: selectors.length,
      iterations,
      queryCount: 0,
      elapsedMs: 0,
      queriesPerSec: 0,
      matchedNodesTotal: 0,
      meanMatchesPerQuery: 0,
      memoryBaselineMB: 0,
      memoryRetainedMB: 0
    };
  }

  for (const selector of selectors) {
    querySelectorAll(selector, rootTree);
  }

  if (typeof globalThis.gc === "function") {
    globalThis.gc();
  }
  const startHeapUsed = process.memoryUsage().heapUsed;

  let matchedNodesTotal = 0;
  const queryCount = selectors.length * iterations;
  const startedAt = performance.now();
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const selector of selectors) {
      matchedNodesTotal += querySelectorAll(selector, rootTree).length;
    }
  }
  const elapsedMs = performance.now() - startedAt;

  if (typeof globalThis.gc === "function") {
    globalThis.gc();
  }
  const retainedHeapUsed = process.memoryUsage().heapUsed;

  return {
    name,
    selectors: selectors.length,
    iterations,
    queryCount,
    elapsedMs: toMillis(elapsedMs),
    queriesPerSec: toNumber(queryCount / (elapsedMs / 1000), 1),
    matchedNodesTotal,
    meanMatchesPerQuery: toNumber(matchedNodesTotal / queryCount, 6),
    memoryBaselineMB: toNumber(startHeapUsed / (1024 * 1024)),
    memoryRetainedMB: toNumber(retainedHeapUsed / (1024 * 1024))
  };
}

async function loadRealworldSelectors(corpusDir) {
  const manifestPath = resolve(process.cwd(), "realworld/manifests/css.ndjson");
  const manifestBytes = await readFile(manifestPath);
  const records = parseNdjson(manifestBytes.toString("utf8"));
  const recordsBySize = [...records].sort((left, right) => right.sizeBytes - left.sizeBytes);
  const selectedRecords = recordsBySize.slice(0, MAX_REALWORLD_RECORDS);

  const uniqueCandidates = new Set();
  for (const record of selectedRecords) {
    const extension = record.kind === "style-attr" ? "decl" : "css";
    const primaryPath = resolve(corpusDir, `cache/css/${record.sha256}.${extension}`);
    const fallbackPath = resolve(corpusDir, `cache/css/${record.sha256}.css`);

    let cssSource = null;
    try {
      cssSource = await readFile(primaryPath, "utf8");
    } catch {
      try {
        cssSource = await readFile(fallbackPath, "utf8");
      } catch {
        cssSource = null;
      }
    }
    if (cssSource === null) {
      continue;
    }

    for (const candidate of extractSelectorCandidates(cssSource)) {
      uniqueCandidates.add(candidate);
    }
  }

  const orderedCandidates = [...uniqueCandidates]
    .map((selector) => ({
      selector,
      rank: sha256Bytes(Buffer.from(selector, "utf8"))
    }))
    .sort((left, right) => left.rank.localeCompare(right.rank) || left.selector.localeCompare(right.selector));

  const selectedSelectors = [];
  let parsedCount = 0;
  let supportedCount = 0;
  for (const entry of orderedCandidates) {
    if (selectedSelectors.length >= MAX_REALWORLD_SELECTORS) {
      break;
    }

    const compiled = compileSelectorList(entry.selector);
    if (compiled.parseErrors.length > 0 || compiled.selectors.length === 0) {
      continue;
    }
    parsedCount += 1;

    if (!compiled.supported) {
      continue;
    }
    supportedCount += 1;
    selectedSelectors.push(compiled);
  }

  return {
    sourceManifestSha256: sha256Bytes(manifestBytes),
    recordsScanned: selectedRecords.length,
    candidateCount: uniqueCandidates.size,
    parsedCount,
    supportedCount,
    selectedCount: selectedSelectors.length,
    selectedHash: sha256Bytes(Buffer.from(selectedSelectors.map((entry) => entry.source).join("\n"), "utf8")),
    selectors: selectedSelectors
  };
}

async function main() {
  const fixturePath = resolve(process.cwd(), "test/fixtures/selectors/v1/cases.json");
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  const fixtureSelectors = fixture.cases.map((fixtureCase) => compileSelectorList(fixtureCase.selector));
  const stressTree = buildSelectorStressTree(fixture.tree);
  const treeStats = countTreeNodes(stressTree);

  const corpusDir = resolve(process.env.VERGE_CORPUS_DIR ?? DEFAULT_VERGE_CORPUS_DIR);
  let realworld = {
    available: false,
    reason: "not-loaded",
    sourceManifestSha256: null,
    recordsScanned: 0,
    candidateCount: 0,
    parsedCount: 0,
    supportedCount: 0,
    selectedCount: 0,
    selectedHash: null,
    selectors: []
  };

  try {
    const loaded = await loadRealworldSelectors(corpusDir);
    realworld = {
      available: loaded.selectedCount > 0,
      reason: loaded.selectedCount > 0 ? "ok" : "no-supported-selectors",
      sourceManifestSha256: loaded.sourceManifestSha256,
      recordsScanned: loaded.recordsScanned,
      candidateCount: loaded.candidateCount,
      parsedCount: loaded.parsedCount,
      supportedCount: loaded.supportedCount,
      selectedCount: loaded.selectedCount,
      selectedHash: loaded.selectedHash,
      selectors: loaded.selectors
    };
  } catch (error) {
    realworld = {
      ...realworld,
      available: false,
      reason: error instanceof Error ? error.message : String(error)
    };
  }

  const benchmarks = [
    benchmarkSelectorQueries("selectors-fixture", stressTree, fixtureSelectors, FIXTURE_ITERATIONS),
    benchmarkSelectorQueries("selectors-realworld", stressTree, realworld.selectors, REALWORLD_ITERATIONS)
  ];

  const report = {
    suite: "bench-selectors",
    timestamp: new Date().toISOString(),
    corpusDir,
    tree: {
      cloneFactor: TREE_CLONE_FACTOR,
      totalNodes: treeStats.totalNodes,
      elementNodes: treeStats.elementNodes
    },
    selection: {
      fixtureCases: fixtureSelectors.length,
      fixtureIterations: FIXTURE_ITERATIONS,
      realworldIterations: REALWORLD_ITERATIONS
    },
    realworld: {
      available: realworld.available,
      reason: realworld.reason,
      sourceManifestSha256: realworld.sourceManifestSha256,
      recordsScanned: realworld.recordsScanned,
      candidateCount: realworld.candidateCount,
      parsedCount: realworld.parsedCount,
      supportedCount: realworld.supportedCount,
      selectedCount: realworld.selectedCount,
      selectedHash: realworld.selectedHash
    },
    benchmarks
  };

  await writeJson("realworld/reports/bench-selectors.json", report);
  process.stdout.write(
    `selector bench ok: fixture=${String(benchmarks[0]?.queriesPerSec ?? 0)}qps realworld=${String(benchmarks[1]?.queriesPerSec ?? 0)}qps\n`
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`selector bench failed: ${message}\n`);
  process.exit(1);
});
