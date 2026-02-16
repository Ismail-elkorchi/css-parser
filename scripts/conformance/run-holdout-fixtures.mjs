import { parse, serialize, tokenize } from "../../dist/mod.js";
import { writeJson } from "../eval/eval-primitives.mjs";

const HOLDOUT_MOD = 10;
const HOLDOUT_RULE = `hash(id) % ${HOLDOUT_MOD} === 0`;

function computeHash(id, multiplier) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (Math.imul(hash, multiplier) + id.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function buildCases() {
  const cases = [];
  for (let index = 0; index < 900; index += 1) {
    cases.push({
      id: `holdout-${String(index + 1).padStart(4, "0")}`,
      input: `.h${index}{--x:${index % 12}px;color:hsl(${index % 360} 60% 50%);transform:translate(${index % 15}px)}`
    });
  }
  return cases;
}

const cases = buildCases();

const selectedCases = cases.filter((entry) => computeHash(entry.id, 39) % HOLDOUT_MOD === 0);

let passed = 0;
let failed = 0;
const failures = [];

for (const fixtureCase of selectedCases) {
  const firstTokens = tokenize(fixtureCase.input);
  const secondTokens = tokenize(fixtureCase.input);
  const firstCanonical = serialize(parse(fixtureCase.input));
  const secondCanonical = serialize(parse(fixtureCase.input));

  const ok =
    JSON.stringify(firstTokens) === JSON.stringify(secondTokens) &&
    firstCanonical === secondCanonical;

  if (ok) {
    passed += 1;
    continue;
  }

  failed += 1;
  failures.push({
    id: fixtureCase.id,
    tokenDeterministic: JSON.stringify(firstTokens) === JSON.stringify(secondTokens),
    serializerDeterministic: firstCanonical === secondCanonical
  });
}

const report = {
  suite: "holdout",
  timestamp: new Date().toISOString(),
  cases: {
    total: selectedCases.length,
    passed,
    failed,
    skipped: 0
  },
  holdout: {
    excluded: selectedCases.length,
    rule: HOLDOUT_RULE,
    mod: HOLDOUT_MOD
  },
  holdoutExcluded: selectedCases.length,
  holdoutRule: HOLDOUT_RULE,
  holdoutMod: HOLDOUT_MOD,
  skips: [],
  failures
};

await writeJson("reports/holdout.json", report);

if (failed > 0) {
  console.error(`Holdout conformance hard failures: ${failed}`);
  process.exit(1);
}

console.log(`Holdout fixtures passed=${passed}, failed=${failed}`);
