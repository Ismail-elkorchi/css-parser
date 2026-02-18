import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPatchPlan,
  computePatch,
  parse,
  PatchPlanningError,
  serialize
} from "../../dist/mod.js";

function findFirstByType(root, type) {
  let match = null;
  const walkNode = (node) => {
    if (match !== null) {
      return;
    }
    if (node.type === type) {
      match = node;
      return;
    }
    const children = Array.isArray(node.children) ? node.children : [];
    for (const child of children) {
      if (child && typeof child === "object" && typeof child.type === "string") {
        walkNode(child);
      }
    }
  };
  walkNode(root);
  return match;
}

test("captureSpans attaches source offsets for rules", () => {
  const css = ".a{color:red}.b{margin:1px}";
  const parsed = parse(css, { captureSpans: true });
  const firstRule = findFirstByType(parsed.root, "Rule");

  assert.ok(firstRule);
  assert.ok(firstRule.span);
  assert.equal(firstRule.spanProvenance, "input");
  assert.equal(css.slice(firstRule.span.start, firstRule.span.end).startsWith(".a{"), true);
});

test("computePatch supports deterministic structural edit plans", () => {
  const original = ".a{color:red}.b{margin:1px}";
  const parsed = parse(original, { captureSpans: true });
  const rules = [];
  for (const node of parsed.children) {
    if (node.type === "Rule") {
      rules.push(node);
    }
  }

  assert.equal(rules.length, 2);

  const edits = [
    { kind: "replaceNode", target: rules[0].id, css: ".a{color:blue}" },
    { kind: "insertCssAfter", target: rules[1].id, css: ".c{padding:2px}" }
  ];

  const firstPlan = computePatch(original, edits);
  const secondPlan = computePatch(original, edits);
  assert.deepEqual(firstPlan, secondPlan);

  const patched = applyPatchPlan(original, firstPlan);
  assert.equal(patched, ".a{color:blue}.b{margin:1px}.c{padding:2px}");

  const patchedTree = parse(patched);
  const expectedTree = parse(".a{color:blue}.b{margin:1px}.c{padding:2px}");
  assert.equal(serialize(patchedTree), serialize(expectedTree));
});

test("computePatch rejects unknown targets with structured error", () => {
  const original = ".a{color:red}";

  assert.throws(
    () => computePatch(original, [{ kind: "replaceNode", target: 999_999, css: ".z{}" }]),
    (error) => {
      assert.ok(error instanceof PatchPlanningError);
      assert.equal(error.payload.code, "NODE_NOT_FOUND");
      return true;
    }
  );
});
