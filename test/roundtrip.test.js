import assert from "node:assert/strict";
import test from "node:test";

import { parseStylesheet, serialize } from "../dist/mod.js";

function parse(source) {
  const result = parseStylesheet(source);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("parse failed");
  return result.value;
}

test("public parse-serialize-parse normalization is stable", () => {
  const first = serialize(parse(".x { color: red; margin: 1px 2px; }"));
  const second = serialize(parse(first));
  assert.equal(first, second);
});
