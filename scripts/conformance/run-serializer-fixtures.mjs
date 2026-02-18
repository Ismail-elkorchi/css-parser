import { writeJson } from "../eval/eval-primitives.mjs";
import { parse, serialize } from "../../dist/mod.js";

const HOLDOUT_MOD = 10;
const HOLDOUT_RULE = `hash(id) % ${HOLDOUT_MOD} === 0`;

function computeHoldout(id) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (Math.imul(hash, 37) + id.charCodeAt(index)) >>> 0;
  }
  return hash % HOLDOUT_MOD === 0;
}

function buildSerializerCases() {
  const cases = [];

  for (let index = 0; index < 240; index += 1) {
    cases.push({
      id: `ser-basic-${String(index + 1).padStart(4, "0")}`,
      input: `.k${index}{margin:${index % 9}px ${(index + 1) % 9}px;color:rgb(${index % 255},${(index * 3) % 255},${(index * 5) % 255})}`
    });
  }

  for (let index = 0; index < 140; index += 1) {
    cases.push({
      id: `ser-at-${String(index + 1).padStart(4, "0")}`,
      input: `@supports (display:grid){.q${index}{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:${index % 6}px}}`
    });
  }

  return cases;
}

const cases = buildSerializerCases();

let passed = 0;
let failed = 0;
let holdoutExcluded = 0;
const failures = [];

for (const fixtureCase of cases) {
  if (computeHoldout(fixtureCase.id)) {
    holdoutExcluded += 1;
    continue;
  }

  const first = serialize(parse(fixtureCase.input));
  const second = serialize(parse(first));
  const third = serialize(parse(second));

  const stable = first === second && second === third;
  if (stable) {
    passed += 1;
    continue;
  }

  failed += 1;
  failures.push({
    id: fixtureCase.id,
    first,
    second,
    third
  });
}

const report = {
  suite: "serializer",
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

await writeJson("reports/serializer.json", report);

if (failed > 0) {
  console.error(`Serializer conformance hard failures: ${failed}`);
  process.exit(1);
}

console.log(`Serializer fixtures passed=${passed}, failed=${failed}, holdoutExcluded=${holdoutExcluded}`);
