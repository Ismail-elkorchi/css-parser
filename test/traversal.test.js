import assert from "node:assert/strict";
import test from "node:test";

import {
  CssTreeStructureError,
  findNodeById,
  findNodesByKind,
  parseStylesheet,
  walkCss
} from "../dist/mod.js";

function parse(source) {
  const result = parseStylesheet(source);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("parse failed");
  return result.value;
}

test("typed traversal follows stable structural order", () => {
  const stylesheet = parse(".a{color:red}.b:hover{margin:1px}");
  const first = [];
  walkCss(stylesheet, (node, depth, parent) => {
    first.push([depth, node.kind, parent?.kind ?? null]);
  });
  const second = [];
  walkCss(stylesheet, (node, depth, parent) => {
    second.push([depth, node.kind, parent?.kind ?? null]);
  });
  assert.deepEqual(first, second);
  assert.deepEqual(
    findNodesByKind(stylesheet, "qualified-rule")
      .map((node) => node.id),
    stylesheet.rules.map((rule) => rule.id)
  );
  assert.equal(
    findNodeById(stylesheet, stylesheet.rules[0].id),
    stylesheet.rules[0]
  );
});

test("traversal rejects cyclic and shared caller-constructed graphs", () => {
  const stylesheet = parse(".a{}");
  const cyclic = {
    ...stylesheet,
    rules: []
  };
  cyclic.rules.push(cyclic);
  assert.throws(
    () => walkCss(cyclic, () => {}),
    (error) =>
      error instanceof CssTreeStructureError &&
      error.reason === "cycle"
  );

  const shared = {
    ...stylesheet,
    rules: [stylesheet.rules[0], stylesheet.rules[0]]
  };
  assert.throws(
    () => walkCss(shared, () => {}),
    (error) =>
      error instanceof CssTreeStructureError &&
      error.reason === "shared-node"
  );
});
