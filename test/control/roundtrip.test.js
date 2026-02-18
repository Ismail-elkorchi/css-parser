import assert from "node:assert/strict";
import test from "node:test";

import { parse, serialize } from "../../dist/mod.js";

test("round trip parse-serialize-parse normalizes stably", () => {
  const firstTree = parse(".x { color: red; margin: 1px 2px; }");
  const firstSerialized = serialize(firstTree);

  const secondTree = parse(firstSerialized);
  const secondSerialized = serialize(secondTree);

  assert.equal(firstSerialized, secondSerialized);
});
