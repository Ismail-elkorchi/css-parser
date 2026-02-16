import { writeJson } from "../eval/eval-primitives.mjs";
import { decodeCssBytes, sniffCssEncoding } from "../../dist/internal/encoding/mod.js";

const HOLDOUT_MOD = 10;
const HOLDOUT_RULE = `hash(id) % ${HOLDOUT_MOD} === 0`;

function computeHoldout(id) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (Math.imul(hash, 29) + id.charCodeAt(index)) >>> 0;
  }
  return hash % HOLDOUT_MOD === 0;
}

function bytes(...values) {
  return new Uint8Array(values);
}

function buildEncodingFixtures() {
  const fixtures = [];

  for (let index = 0; index < 30; index += 1) {
    fixtures.push({
      id: `enc-bom-utf8-${String(index + 1).padStart(3, "0")}`,
      bytes: bytes(0xef, 0xbb, 0xbf, 0x2e, 0x61, 0x7b, 0x63, 0x6f, 0x6c, 0x6f, 0x72, 0x3a, 0x72, 0x65, 0x64, 0x7d),
      expectedEncoding: "utf-8",
      expectedSource: "bom"
    });
  }

  for (let index = 0; index < 20; index += 1) {
    fixtures.push({
      id: `enc-bom-utf16le-${String(index + 1).padStart(3, "0")}`,
      bytes: bytes(0xff, 0xfe, 0x40, 0x00, 0x63, 0x00),
      expectedEncoding: "utf-16le",
      expectedSource: "bom"
    });
  }

  for (let index = 0; index < 30; index += 1) {
    fixtures.push({
      id: `enc-transport-${String(index + 1).padStart(3, "0")}`,
      bytes: bytes(0x2e, 0x74, 0x7b, 0x6d, 0x61, 0x72, 0x67, 0x69, 0x6e, 0x3a, 0x31, 0x70, 0x78, 0x7d),
      transportEncodingLabel: "windows-1252",
      expectedEncoding: "windows-1252",
      expectedSource: "transport"
    });
  }

  for (let index = 0; index < 20; index += 1) {
    fixtures.push({
      id: `enc-charset-${String(index + 1).padStart(3, "0")}`,
      bytes: bytes(
        0x40, 0x63, 0x68, 0x61, 0x72, 0x73, 0x65, 0x74, 0x20, 0x22, 0x49, 0x53, 0x4f, 0x2d, 0x38, 0x38, 0x35, 0x39,
        0x2d, 0x31, 0x22, 0x3b, 0x0a, 0x2e, 0x61, 0x7b, 0x7d
      ),
      expectedEncoding: "windows-1252",
      expectedSource: "charset"
    });
  }

  for (let index = 0; index < 20; index += 1) {
    fixtures.push({
      id: `enc-default-${String(index + 1).padStart(3, "0")}`,
      bytes: bytes(0x2e, 0x64, 0x7b, 0x7d),
      expectedEncoding: "utf-8",
      expectedSource: "default"
    });
  }

  return fixtures;
}

const fixtures = buildEncodingFixtures();

let passed = 0;
let failed = 0;
let holdoutExcluded = 0;
const failures = [];

for (const fixtureCase of fixtures) {
  if (computeHoldout(fixtureCase.id)) {
    holdoutExcluded += 1;
    continue;
  }

  const sniff = sniffCssEncoding(fixtureCase.bytes, {
    ...(fixtureCase.transportEncodingLabel
      ? { transportEncodingLabel: fixtureCase.transportEncodingLabel }
      : {})
  });
  const decoded = decodeCssBytes(fixtureCase.bytes, {
    ...(fixtureCase.transportEncodingLabel
      ? { transportEncodingLabel: fixtureCase.transportEncodingLabel }
      : {})
  });

  const ok =
    sniff.encoding === fixtureCase.expectedEncoding &&
    sniff.source === fixtureCase.expectedSource &&
    decoded.sniff.encoding === fixtureCase.expectedEncoding &&
    typeof decoded.text === "string";

  if (ok) {
    passed += 1;
    continue;
  }

  failed += 1;
  failures.push({
    id: fixtureCase.id,
    expectedEncoding: fixtureCase.expectedEncoding,
    expectedSource: fixtureCase.expectedSource,
    actualEncoding: sniff.encoding,
    actualSource: sniff.source
  });
}

const report = {
  suite: "encoding",
  timestamp: new Date().toISOString(),
  cases: {
    total: fixtures.length - holdoutExcluded,
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

await writeJson("reports/encoding.json", report);

if (failed > 0) {
  console.error(`Encoding conformance hard failures: ${failed}`);
  process.exit(1);
}

console.log(`Encoding fixtures passed=${passed}, failed=${failed}, holdoutExcluded=${holdoutExcluded}`);
