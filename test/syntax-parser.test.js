import assert from "node:assert/strict";
import test from "node:test";

import {
  parseCssBlockContents,
  parseCssCommaSeparatedComponentValues,
  parseCssComponentValue,
  parseCssComponentValues,
  parseCssDeclaration,
  parseCssRule,
  parseCssStylesheet,
  parseCssStylesheetContents
} from "../dist/internal/syntax/parser.js";
import { SyntaxResourceError } from "../dist/internal/syntax/resources.js";

function valueKinds(values) {
  return values.map((value) => value.kind);
}

test("parser builds stylesheet and at-rule structure", () => {
  const result = parseCssStylesheet(
    "@layer reset; @media (width > 20rem) { .card { color: red } }"
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.value.kind, "stylesheet");
  assert.deepEqual(result.value.rules.map((rule) => [rule.kind, rule.name]), [
    ["at-rule", "layer"],
    ["at-rule", "media"]
  ]);
  assert.equal(result.value.rules[0].block, null);
  assert.equal(result.value.rules[1].block.items[0].kind, "qualified-rule");
  assert.deepEqual(
    result.value.rules[1].block.items[0].block.items.map((item) => item.kind),
    ["declaration"]
  );
  assert.deepEqual(result.errors, []);
});

test("block parsing preserves nesting order without declaration duplication", () => {
  const result = parseCssBlockContents(
    "color:red; & > .title { color:blue } @media(x){display:block} background:white"
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.value.map((item) => item.kind), [
    "declaration",
    "qualified-rule",
    "at-rule",
    "declaration"
  ]);
  assert.equal(result.value[0].name, "color");
  assert.equal(result.value[1].block.items[0].name, "color");
  assert.equal(result.value[2].block.items[0].name, "display");
  assert.equal(result.value[3].name, "background");
});

test("declarations retain custom-property text and extract important structurally", () => {
  const custom = parseCssDeclaration("--tokens: [a]{b:c} d");
  assert.equal(custom.ok, true);
  if (custom.ok) {
    assert.equal(custom.value.originalText, "[a]{b:c} d");
    assert.deepEqual(valueKinds(custom.value.value), [
      "simple-block",
      "simple-block",
      "whitespace",
      "ident"
    ]);
  }

  const important = parseCssDeclaration("color: red \t! IMPORTANT ");
  assert.equal(important.ok, true);
  if (important.ok) {
    assert.equal(important.value.important, true);
    assert.deepEqual(valueKinds(important.value.value), ["ident"]);
  }
});

test("unicode-range descriptor values use the isolated tokenizer mode", () => {
  const result = parseCssDeclaration("unicode-range: U+0-7F, U+4??");
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(
    result.value.value
      .filter((value) => value.kind === "unicode-range")
      .map((value) => [value.start, value.end, value.span.start.offset, value.span.end.offset]),
    [
      [0, 0x7f, 15, 21],
      [0x400, 0x4ff, 23, 28]
    ]
  );
});

test("component-value entrypoints build nested blocks and split top-level commas", () => {
  const single = parseCssComponentValue("calc(1 + [x])");
  assert.equal(single.ok, true);
  if (single.ok) {
    assert.equal(single.value.kind, "function-block");
    assert.equal(single.value.value.at(-1).kind, "simple-block");
  }

  const list = parseCssComponentValues("a,(b,c),d");
  assert.equal(list.ok, true);
  if (list.ok) {
    assert.deepEqual(valueKinds(list.value), [
      "ident",
      "comma",
      "simple-block",
      "comma",
      "ident"
    ]);
  }

  const groups = parseCssCommaSeparatedComponentValues("a,(b,c),d");
  assert.equal(groups.ok, true);
  if (groups.ok) {
    assert.deepEqual(groups.value.map(valueKinds), [
      ["ident"],
      ["simple-block"],
      ["ident"]
    ]);
  }
});

test("single-item entrypoints reject empty and trailing input", () => {
  const emptyRule = parseCssRule("");
  assert.equal(emptyRule.ok, false);
  assert.equal(emptyRule.errors.at(-1).code, "empty-input");

  const extraRule = parseCssRule("a{} b{}");
  assert.equal(extraRule.ok, false);
  assert.equal(extraRule.errors.at(-1).code, "trailing-input");

  const extraValue = parseCssComponentValue("a b");
  assert.equal(extraValue.ok, false);
  assert.equal(extraValue.errors.at(-1).code, "trailing-input");
});

test("declaration entrypoint returns the first declaration as specified", () => {
  const result = parseCssDeclaration("color:red; trailing");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.name, "color");
    assert.equal(result.value.value[0].value, "red");
  }
});

test("invalid structures recover without raw fallback nodes", () => {
  const result = parseCssStylesheet("a{broken; color:red} trailing");
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.value.rules[0].block.items.map((item) => item.kind), [
    "declaration"
  ]);
  assert.ok(result.errors.some((error) => error.code === "invalid-declaration"));
  assert.ok(result.errors.some((error) => error.code === "invalid-rule"));
  assert.equal(JSON.stringify(result.value).includes("\"raw\""), false);
});

test("comments-only input retains its exact EOF position", () => {
  const result = parseCssStylesheet("/* comment */");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.span, {
    start: { offset: 13, line: 1, column: 14 },
    end: { offset: 13, line: 1, column: 14 }
  });
});

test("node IDs and spans are unique, deterministic, and bounded", () => {
  const first = parseCssStylesheet("a{color:red;b{c:d}}");
  const second = parseCssStylesheet("a{color:red;b{c:d}}");
  assert.deepEqual(first, second);
  assert.equal(first.ok, true);
  if (!first.ok) return;

  const ids = [];
  const visit = (value) => {
    if (value === null || typeof value !== "object") return;
    if ("id" in value) ids.push(value.id);
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(visit);
      else visit(child);
    }
  };
  visit(first.value);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(first.usage.maxDepth >= 4);
});

test("parser enforces UTF-8 input, node, depth, and work limits", () => {
  assert.throws(
    () => parseCssStylesheet("😀", { limits: { maxInputBytes: 3 } }),
    (error) => error instanceof SyntaxResourceError && error.limitName === "maxInputBytes"
  );
  assert.throws(
    () => parseCssStylesheet("a{}b{}", { limits: { maxNodes: 2 } }),
    (error) => error instanceof SyntaxResourceError && error.limitName === "maxNodes"
  );
  assert.throws(
    () => parseCssStylesheet("a{b{c:d}}", { limits: { maxDepth: 3 } }),
    (error) => error instanceof SyntaxResourceError && error.limitName === "maxDepth"
  );
  assert.throws(
    () => parseCssStylesheet("abcdef", { limits: { maxSteps: 2 } }),
    (error) => error instanceof SyntaxResourceError && error.limitName === "maxSteps"
  );
});

test("stylesheet-contents entrypoint returns rules rather than a synthetic root", () => {
  const result = parseCssStylesheetContents("@a; b{}");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.map((rule) => rule.kind), ["at-rule", "qualified-rule"]);
  }
});
