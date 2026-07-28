import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPatch,
  computePatch,
  findNodesByKind,
  parseStylesheet,
  PatchPlanningError,
  serialize
} from "../dist/mod.js";

function parse(source) {
  const result = parseStylesheet(source);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("parse failed");
  return result.value;
}

test("source edits use exact parser spans", () => {
  const source = ".a{color:red}.b{margin:1px}";
  const stylesheet = parse(source);
  const rules = findNodesByKind(stylesheet, "qualified-rule");
  assert.equal(rules.length, 2);
  assert.equal(
    source.slice(rules[0].span.start.offset, rules[0].span.end.offset),
    ".a{color:red}"
  );

  const edits = [
    { kind: "replace-node", target: rules[0].id, css: ".a{color:blue}" },
    { kind: "insert-after", target: rules[1].id, css: ".c{padding:2px}" }
  ];
  const first = computePatch(source, stylesheet, edits);
  const second = computePatch(source, stylesheet, edits);
  assert.deepEqual(first, second);
  assert.equal(first.result, ".a{color:blue}.b{margin:1px}.c{padding:2px}");
  assert.equal(applyPatch(source, first), first.result);
  assert.equal(
    serialize(parse(first.result)),
    ".a{color:blue;}.b{margin:1px;}.c{padding:2px;}"
  );
});

test("source edits reject missing, overlapping, and tampered plans", () => {
  const source = ".a{color:red}";
  const stylesheet = parse(source);
  const rule = stylesheet.rules[0];
  assert.ok(rule);

  assert.throws(
    () => computePatch(source, stylesheet, [
      { kind: "replace-node", target: 999_999, css: ".z{}" }
    ]),
    (error) =>
      error instanceof PatchPlanningError &&
      error.reason === "node-not-found"
  );
  assert.throws(
    () => computePatch(source, stylesheet, [
      { kind: "remove-node", target: stylesheet.id },
      { kind: "remove-node", target: rule.id }
    ]),
    (error) =>
      error instanceof PatchPlanningError &&
      error.reason === "overlapping-edits"
  );

  const plan = computePatch(source, stylesheet, []);
  assert.throws(
    () => applyPatch(source, { ...plan, result: "tampered" }),
    (error) =>
      error instanceof PatchPlanningError &&
      error.reason === "invalid-plan"
  );
  assert.throws(
    () => computePatch(source, stylesheet, [
      { kind: "replace-node", target: rule.id }
    ]),
    (error) =>
      error instanceof PatchPlanningError &&
      error.reason === "invalid-edit"
  );
  assert.throws(
    () => applyPatch(source, {
      operations: [{ kind: "unknown", start: 0, end: source.length }],
      result: source
    }),
    (error) =>
      error instanceof PatchPlanningError &&
      error.reason === "invalid-plan"
  );
});

test("source edits reject duplicate node identities", () => {
  const source = ".a{color:red}";
  const stylesheet = parse(source);
  const rule = stylesheet.rules[0];
  assert.ok(rule);
  const duplicate = {
    ...stylesheet,
    rules: [{ ...rule, id: stylesheet.id }]
  };
  assert.throws(
    () => computePatch(source, duplicate, []),
    (error) =>
      error instanceof PatchPlanningError &&
      error.reason === "duplicate-node-id"
  );
});
