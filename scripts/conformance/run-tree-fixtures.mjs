import { writeJson } from "../eval/eval-primitives.mjs";
import { parse, serialize } from "../../dist/mod.js";

const HOLDOUT_MOD = 10;
const HOLDOUT_RULE = `hash(id) % ${HOLDOUT_MOD} === 0`;

function computeHoldout(id) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (Math.imul(hash, 31) + id.charCodeAt(index)) >>> 0;
  }
  return hash % HOLDOUT_MOD === 0;
}

function buildParserCases() {
  const cases = [];

  for (let index = 0; index < 260; index += 1) {
    cases.push({
      id: `tree-style-${String(index + 1).padStart(4, "0")}`,
      input: `.s${index}>.n${index % 19}:where(.x,.y){color:hsl(${index % 360} 50% 50%);padding:${index % 8}px}`
    });
  }

  for (let index = 0; index < 160; index += 1) {
    cases.push({
      id: `tree-at-${String(index + 1).padStart(4, "0")}`,
      input: `@media (min-width:${index + 1}px){@supports (display:grid){.g${index}{grid-template-columns:repeat(2,minmax(0,1fr));gap:${index % 7}px}}}`
    });
  }

  for (let index = 0; index < 120; index += 1) {
    cases.push({
      id: `tree-var-${String(index + 1).padStart(4, "0")}`,
      input: `:root{--k${index}:${index % 15}px}.v${index}{margin:var(--k${index});transform:translateX(calc(var(--k${index}) + 1px))}`
    });
  }

  return cases;
}

const cases = buildParserCases();

let passed = 0;
let failed = 0;
let holdoutExcluded = 0;
const failures = [];

for (const fixtureCase of cases) {
  if (computeHoldout(fixtureCase.id)) {
    holdoutExcluded += 1;
    continue;
  }

  const first = parse(fixtureCase.input, { captureSpans: true, trace: true });
  const second = parse(fixtureCase.input, { captureSpans: true, trace: true });

  const firstCanonical = serialize(first);
  const secondCanonical = serialize(second);
  const reparsedCanonical = serialize(parse(firstCanonical, { captureSpans: true }));

  const deterministicTree = JSON.stringify(first) === JSON.stringify(second);
  const canonicalStable = firstCanonical === secondCanonical && firstCanonical === reparsedCanonical;

  if (deterministicTree && canonicalStable) {
    passed += 1;
    continue;
  }

  failed += 1;
  failures.push({
    id: fixtureCase.id,
    deterministicTree,
    canonicalStable,
    firstCanonical,
    secondCanonical,
    reparsedCanonical
  });
}

const report = {
  suite: "tree",
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

await writeJson("reports/tree.json", report);

if (failed > 0) {
  console.error(`Tree conformance hard failures: ${failed}`);
  process.exit(1);
}

console.log(`Tree fixtures passed=${passed}, failed=${failed}, holdoutExcluded=${holdoutExcluded}`);
