import { mkdir, writeFile } from "node:fs/promises";

import { BudgetExceededError, parse, serialize } from "../../dist/mod.js";

const runs = 700;
const initialSeed = 0x9e3779b9;
let state = initialSeed;

function nextInteger() {
  state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
  return state;
}

function integer(maximum) {
  return maximum <= 0 ? 0 : nextInteger() % maximum;
}

function generate(index) {
  const parts = [];
  const selectorCount = 1 + integer(4);
  for (let selector = 0; selector < selectorCount; selector += 1) {
    parts.push(
      `.f${index}_${selector}:is(.a,.b){color:rgb(${integer(255)} ${integer(255)} ${integer(255)});` +
      `padding:${integer(12)}px;transform:translate(${integer(20)}px)}`
    );
    if (integer(4) === 0) {
      parts.push(`@media (min-width:${1 + integer(600)}px){.f${index}_${selector}{margin:${integer(10)}px}}`);
    }
    if (integer(5) === 0) {
      parts.push(`:root{--k${index}_${selector}:${integer(16)}px}`);
    }
  }
  if (integer(7) === 0) parts.push("@media (");
  return parts.join("");
}

let crashes = 0;
let budgetErrors = 0;
const failures = [];

for (let index = 0; index < runs; index += 1) {
  const source = generate(index);
  try {
    const options = {
      budgets: {
        maxInputBytes: 32_768,
        maxTokens: 12_000,
        maxNodes: 12_000,
        maxDepth: 512,
        maxTimeMs: 500
      }
    };
    const first = parse(source, options);
    const second = parse(source, options);
    if (
      JSON.stringify(first) !== JSON.stringify(second) ||
      serialize(first) !== serialize(second)
    ) {
      failures.push({ index, reason: "nondeterministic result" });
    }
  } catch (error) {
    if (error instanceof BudgetExceededError) {
      budgetErrors += 1;
    } else {
      crashes += 1;
      failures.push({
        index,
        reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      });
    }
  }
}

const report = {
  schemaVersion: 1,
  suite: "css-parser-fuzz",
  generatedAt: new Date().toISOString(),
  ok: crashes === 0 && failures.length === 0,
  seed: initialSeed,
  runs,
  crashes,
  budgetErrors,
  failures
};

await mkdir(new URL("../../reports/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../../reports/fuzz.json", import.meta.url),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8"
);

if (!report.ok) throw new Error(`fuzz qualification failed: ${JSON.stringify(failures.slice(0, 5))}`);
process.stdout.write(`fuzz qualification passed: ${String(runs)} cases\n`);
