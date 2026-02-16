import { writeJson } from "../eval/eval-primitives.mjs";
import { tokenize } from "../../dist/internal/tokenizer/mod.js";

const HOLDOUT_MOD = 10;
const HOLDOUT_RULE = `hash(id) % ${HOLDOUT_MOD} === 0`;

function computeHoldout(id) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (Math.imul(hash, 33) + id.charCodeAt(index)) >>> 0;
  }
  return hash % HOLDOUT_MOD === 0;
}

function buildTokenizerCases() {
  const cases = [];

  for (let index = 0; index < 220; index += 1) {
    cases.push({
      id: `tok-rule-${String(index + 1).padStart(4, "0")}`,
      input: `.c${index}{color:rgb(${index % 255},${(index * 3) % 255},${(index * 7) % 255});margin:${index % 10}px}`
    });
  }

  for (let index = 0; index < 120; index += 1) {
    cases.push({
      id: `tok-media-${String(index + 1).padStart(4, "0")}`,
      input: `@media (min-width:${index + 1}px){.m${index}{padding:${index % 5}px ${(index + 2) % 7}px}}`
    });
  }

  for (let index = 0; index < 120; index += 1) {
    cases.push({
      id: `tok-var-${String(index + 1).padStart(4, "0")}`,
      input: `.v${index}{--x${index}:${index}px;transform:translate(calc(${index % 13}px + 1px))}`
    });
  }

  return cases;
}

const cases = buildTokenizerCases();

let passed = 0;
let failed = 0;
let holdoutExcluded = 0;
const failures = [];

for (const fixtureCase of cases) {
  if (computeHoldout(fixtureCase.id)) {
    holdoutExcluded += 1;
    continue;
  }

  const first = tokenize(fixtureCase.input, {
    budgets: {
      maxTokens: 4096,
      maxTimeMs: 200
    }
  });
  const second = tokenize(fixtureCase.input, {
    budgets: {
      maxTokens: 4096,
      maxTimeMs: 200
    }
  });

  const firstTokens = first.tokens.map((token) => `${token.rawKind}:${token.value}`);
  const secondTokens = second.tokens.map((token) => `${token.rawKind}:${token.value}`);
  const deterministic = JSON.stringify(firstTokens) === JSON.stringify(secondTokens);
  const spansOk = first.tokens.every(
    (token) => token.start >= 0 && token.end >= token.start && token.end <= fixtureCase.input.length
  );
  const nonEmpty = first.tokens.length > 0;

  if (deterministic && spansOk && nonEmpty) {
    passed += 1;
    continue;
  }

  failed += 1;
  failures.push({
    id: fixtureCase.id,
    deterministic,
    spansOk,
    nonEmpty,
    firstPreview: firstTokens.slice(0, 12),
    secondPreview: secondTokens.slice(0, 12)
  });
}

const report = {
  suite: "tokenizer",
  timestamp: new Date().toISOString(),
  cases: {
    total: cases.length - holdoutExcluded,
    passed,
    failed,
    skipped: 0
  },
  holdout: {
    excluded: holdoutExcluded,
    rule: HOLDOUT_RULE,
    mod: HOLDOUT_MOD
  },
  holdoutExcluded,
  holdoutRule: HOLDOUT_RULE,
  holdoutMod: HOLDOUT_MOD,
  skips: [],
  failures
};

await writeJson("reports/tokenizer.json", report);

if (failed > 0) {
  console.error(`Tokenizer conformance hard failures: ${failed}`);
  process.exit(1);
}

console.log(`Tokenizer fixtures passed=${passed}, failed=${failed}, holdoutExcluded=${holdoutExcluded}`);
