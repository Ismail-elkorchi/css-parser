import { performance } from "node:perf_hooks";

import { BudgetExceededError, parse, serialize } from "../../dist/mod.js";
import { writeJson } from "../eval/eval-primitives.mjs";

const RUNS = 700;
const SEED = 0x9e3779b9;
const HANG_THRESHOLD_MS = 20;
const TOP_SLOWEST = 16;

function nextSeed(seed) {
  return (Math.imul(seed, 1103515245) + 12345) >>> 0;
}

function createRng(seed) {
  let state = seed >>> 0;

  const nextUInt = () => {
    state = nextSeed(state);
    return state;
  };

  const int = (max) => {
    if (max <= 0) {
      return 0;
    }
    return nextUInt() % max;
  };

  return {
    nextUInt,
    int
  };
}

function buildCss(seed, runIndex) {
  const rng = createRng(seed);
  const parts = [];

  const selectorCount = 1 + rng.int(4);
  for (let selectorIndex = 0; selectorIndex < selectorCount; selectorIndex += 1) {
    const colorA = rng.int(255);
    const colorB = rng.int(255);
    const colorC = rng.int(255);
    const width = 1 + rng.int(600);
    const pad = rng.int(12);

    parts.push(
      `.f${runIndex}_${selectorIndex}:is(.a,.b){color:rgb(${colorA},${colorB},${colorC});padding:${pad}px;transform:translate(${rng.int(20)}px)}`
    );

    if (rng.int(4) === 0) {
      parts.push(`@media (min-width:${width}px){.f${runIndex}_${selectorIndex}{margin:${rng.int(10)}px}}`);
    }

    if (rng.int(5) === 0) {
      parts.push(`:root{--k${runIndex}_${selectorIndex}:${rng.int(16)}px}`);
      parts.push(`.f${runIndex}_${selectorIndex}{margin:var(--k${runIndex}_${selectorIndex})}`);
    }

    if (rng.int(7) === 0) {
      parts.push(`.f${runIndex}_${selectorIndex}{&:hover{color:hsl(${rng.int(360)} 50% 40%)}}`);
    }
  }

  if (rng.int(6) === 0) {
    parts.push(`@font-face{font-family:f${runIndex};src:url(f${runIndex}.woff2);unicode-range:U+0030-U+0039}`);
  }

  if (rng.int(5) === 0) {
    parts.push("@media (");
  }

  return parts.join("");
}

let crashes = 0;
let hangs = 0;
let budgetErrors = 0;
let normalParses = 0;
const findings = [];
const slowCases = [];
let state = SEED;

for (let run = 0; run < RUNS; run += 1) {
  state = nextSeed(state);
  const caseSeed = state;
  const caseId = `fuzz-${String(run + 1).padStart(4, "0")}`;
  const css = buildCss(caseSeed, run);

  const started = performance.now();
  let outcome = "normal";

  try {
    const first = parse(css, {
      trace: true,
      budgets: {
        maxInputBytes: 32_768,
        maxTokens: 12_000,
        maxNodes: 12_000,
        maxDepth: 512,
        maxTraceEvents: 600,
        maxTraceBytes: 80_000,
        maxTimeMs: 200
      }
    });

    const second = parse(css, {
      trace: true,
      budgets: {
        maxInputBytes: 32_768,
        maxTokens: 12_000,
        maxNodes: 12_000,
        maxDepth: 512,
        maxTraceEvents: 600,
        maxTraceBytes: 80_000,
        maxTimeMs: 200
      }
    });

    normalParses += 1;

    if (JSON.stringify(first) !== JSON.stringify(second)) {
      findings.push({
        id: caseId,
        seed: `0x${caseSeed.toString(16)}`,
        type: "nondeterministic"
      });
    }

    const canonicalA = serialize(first);
    const canonicalB = serialize(second);
    if (canonicalA !== canonicalB) {
      findings.push({
        id: caseId,
        seed: `0x${caseSeed.toString(16)}`,
        type: "serializer-nondeterministic"
      });
    }
  } catch (error) {
    if (error instanceof BudgetExceededError) {
      budgetErrors += 1;
      outcome = "budget-error";
    } else {
      crashes += 1;
      outcome = "crash";
      findings.push({
        id: caseId,
        seed: `0x${caseSeed.toString(16)}`,
        type: "crash",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const elapsed = performance.now() - started;
  if (elapsed > HANG_THRESHOLD_MS) {
    hangs += 1;
    findings.push({
      id: caseId,
      seed: `0x${caseSeed.toString(16)}`,
      type: "slow-case",
      elapsedMs: Number(elapsed.toFixed(3))
    });
  }

  slowCases.push({
    id: caseId,
    seed: `0x${caseSeed.toString(16)}`,
    elapsedMs: Number(elapsed.toFixed(3)),
    outcome
  });
}

slowCases.sort((left, right) => right.elapsedMs - left.elapsedMs || left.id.localeCompare(right.id));

await writeJson("reports/fuzz.json", {
  suite: "fuzz",
  timestamp: new Date().toISOString(),
  runs: RUNS,
  seed: `0x${SEED.toString(16)}`,
  crashes,
  hangs,
  budgetErrors,
  normalParses,
  topSlowCases: slowCases.slice(0, TOP_SLOWEST),
  findings
});

if (crashes > 0 || hangs > 0) {
  console.error(`Fuzz found crashes=${crashes} hangs=${hangs}`);
  process.exit(1);
}

console.log(`Fuzz complete runs=${RUNS} budgetErrors=${budgetErrors}`);
