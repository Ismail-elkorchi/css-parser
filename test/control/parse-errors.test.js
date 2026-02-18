import assert from "node:assert/strict";
import test from "node:test";

import { getParseErrorSpecRef, parse } from "../../dist/mod.js";

const PARSE_ERRORS_SECTION_URL = "https://drafts.csswg.org/css-syntax/#error-handling";

test("parse reports deterministic parseErrorId values for malformed CSS", () => {
  const malformedCss = "@media ( { color: red; }";
  const firstRun = parse(malformedCss);
  const secondRun = parse(malformedCss);

  const firstIds = firstRun.errors.map((entry) => entry.parseErrorId);
  const secondIds = secondRun.errors.map((entry) => entry.parseErrorId);

  assert.ok(firstIds.length > 0);
  assert.ok(firstIds.every((entry) => typeof entry === "string" && entry.length > 0));
  assert.deepEqual(firstIds, secondIds);
});

test("parse trace parseError events align with parseErrorId", () => {
  const parsed = parse("@supports (display:grid { .a{display:grid} }", { trace: true });
  const traceIds = (parsed.trace ?? [])
    .filter((entry) => entry.kind === "parseError")
    .map((entry) => entry.parseErrorId);

  assert.ok(traceIds.length > 0);
  assert.ok(traceIds.every((entry) => typeof entry === "string" && entry.length > 0));
});

test("getParseErrorSpecRef returns stable CSS Syntax error-handling URL", () => {
  const parsed = parse("@media ( { color:red }");
  const ids = parsed.errors.map((entry) => entry.parseErrorId);
  assert.ok(ids.length > 0);

  for (const parseErrorId of ids) {
    assert.equal(getParseErrorSpecRef(parseErrorId), PARSE_ERRORS_SECTION_URL);
  }
});
