import assert from "node:assert/strict";
import test from "node:test";

import {
  cloneCssComponentValues,
  CssTreeStructureError,
  parseComponentValues,
  serializeCssComponentValues,
  SyntaxAbortError,
  SyntaxResourceError
} from "../dist/mod.js";

function parsed(source) {
  const result = parseComponentValues(source);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("Expected component values");
  return result.value;
}

test("component-value cloning unfolds shared functions into one syntax tree", () => {
  const source = parsed("calc(1px + [2px])");
  const calculation = source[0];
  assert.equal(calculation?.kind, "function-block");
  if (calculation?.kind !== "function-block") return;

  const shared = [calculation, calculation];
  assert.throws(
    () => serializeCssComponentValues(shared),
    (error) => error?.code === "shared-structure"
  );

  const cloned = cloneCssComponentValues(shared);
  assert.equal(serializeCssComponentValues(cloned), "calc(1px + [2px])calc(1px + [2px])");
  assert.notEqual(cloned[0], cloned[1]);
  assert.notEqual(cloned[0].id, cloned[1].id);
  assert.notEqual(cloned[0].value, cloned[1].value);
  assert.notEqual(cloned[0].value.at(-1), cloned[1].value.at(-1));
  assert.deepEqual([cloned[0].id, cloned[0].value.at(-1).id, cloned[1].id], [1, 2, 3]);
});

test("component-value cloning gives repeated preserved tokens fresh identities", () => {
  const source = parsed("red");
  const token = source[0];
  assert.ok(token);
  const cloned = cloneCssComponentValues([token, token]);
  assert.equal(serializeCssComponentValues(cloned), "red/**/red");
  assert.notEqual(cloned[0], cloned[1]);
  assert.notEqual(cloned[0].span, cloned[1].span);
  assert.notEqual(cloned[0].span.start, cloned[1].span.start);
});

test("component-value cloning rejects cycles while permitting shared acyclic input", () => {
  const value = {
    kind: "function-block",
    id: 1,
    span: {
      start: { offset: 0, line: 1, column: 1 },
      end: { offset: 3, line: 1, column: 4 }
    },
    name: "x",
    value: []
  };
  value.value.push(value);
  assert.throws(
    () => cloneCssComponentValues([value]),
    (error) => error instanceof CssTreeStructureError && error.reason === "cycle"
  );
});

test("component-value cloning enforces work, node, token, depth, and cancellation bounds", () => {
  const nested = parsed("calc(1px + [2px])");
  assert.throws(
    () => cloneCssComponentValues(nested, { limits: { maxSteps: 1 } }),
    (error) => error instanceof SyntaxResourceError && error.limitName === "maxSteps"
  );
  assert.throws(
    () => cloneCssComponentValues(nested, { limits: { maxNodes: 1 } }),
    (error) => error instanceof SyntaxResourceError && error.limitName === "maxNodes"
  );
  assert.throws(
    () => cloneCssComponentValues(parsed("red"), { limits: { maxTokens: 0 } }),
    (error) => error instanceof SyntaxResourceError && error.limitName === "maxTokens"
  );
  assert.throws(
    () => cloneCssComponentValues(nested, { limits: { maxDepth: 0 } }),
    (error) => error instanceof SyntaxResourceError && error.limitName === "maxDepth"
  );

  const controller = new AbortController();
  controller.abort("stop");
  assert.throws(
    () => cloneCssComponentValues(nested, { signal: controller.signal }),
    (error) => error instanceof SyntaxAbortError && error.cause === "stop"
  );
});
