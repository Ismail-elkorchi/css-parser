import assert from "node:assert/strict";
import test from "node:test";

import {
  parseBlockContents,
  parseComponentValue,
  parseDeclaration,
  parseRule,
  parseStylesheet,
  parseStylesheetBytes,
  serialize,
  SyntaxResourceError,
  tokenize,
  tokenizeBytes
} from "../dist/mod.js";

function value(result) {
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  if (!result.ok) throw new Error("parse failed");
  return result.value;
}

test("public parsing entrypoints expose the typed syntax model", () => {
  const stylesheet = parseStylesheet(".a { color: red }");
  assert.equal(stylesheet.ok, true);
  if (!stylesheet.ok) return;
  assert.equal(stylesheet.value.kind, "stylesheet");
  assert.equal(stylesheet.value.rules[0].kind, "qualified-rule");
  assert.equal(serialize(stylesheet.value), ".a {color:red;}");

  assert.equal(value(parseRule("@layer base;")).kind, "at-rule");
  assert.equal(value(parseDeclaration("color:red")).kind, "declaration");
  assert.equal(value(parseComponentValue("calc(1px + 2%)")).kind, "function-block");
  assert.deepEqual(
    value(parseBlockContents("color:red;&{display:block}"))
      .map((item) => item.kind),
    ["declaration", "qualified-rule"]
  );
});

test("public tokenization returns diagnostics, usage, and exact tokens", () => {
  const first = tokenize(".x{color:red}");
  const second = tokenize(".x{color:red}");
  assert.deepEqual(first, second);
  assert.ok(first.tokens.length >= 4);
  assert.equal(first.usage.inputBytes, 13);
});

test("public tokenization cannot enable descriptor-only tokenizer state", () => {
  const regular = tokenize("U+4??");
  const attemptedOverride = tokenize("U+4??", { unicodeRanges: true });
  assert.deepEqual(attemptedOverride, regular);
  assert.equal(regular.tokens.some((token) => token.kind === "unicode-range"), false);
});

test("byte entrypoints expose the encoding decision and raw-byte usage", () => {
  const bytes = new TextEncoder().encode('@charset "utf-8";.b{margin:1px}');
  const parsed = parseStylesheetBytes(bytes);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.encoding.source, "charset");
  assert.equal(parsed.usage.inputBytes, bytes.byteLength);
  if (parsed.ok) assert.equal(parsed.value.kind, "stylesheet");

  const tokenized = tokenizeBytes(bytes);
  assert.equal(tokenized.encoding.source, "charset");
  assert.equal(tokenized.usage.inputBytes, bytes.byteLength);
  assert.ok(tokenized.tokens.length > 0);
});

test("public parsing enforces every deterministic work limit", () => {
  const cases = [
    ["maxInputBytes", { maxInputBytes: 3 }],
    ["maxTokens", { maxTokens: 2 }],
    ["maxNodes", { maxNodes: 2 }],
    ["maxDepth", { maxDepth: 2 }],
    ["maxSteps", { maxSteps: 2 }]
  ];
  for (const [limitName, limits] of cases) {
    assert.throws(
      () => parseStylesheet(".a{color:red}", { limits }),
      (error) =>
        error instanceof SyntaxResourceError &&
        error.limitName === limitName
    );
  }
});

test("public byte boundaries reject invalid JavaScript arguments", () => {
  assert.throws(
    () => parseStylesheetBytes("not bytes"),
    /Uint8Array/u
  );
  assert.throws(
    () => tokenizeBytes(new Uint8Array(), {
      maxCharsetBytes: 1
    }),
    /maxCharsetBytes/u
  );
  assert.throws(
    () => parseStylesheet(null),
    /input must be a string/u
  );
  assert.throws(
    () => tokenize("", null),
    /options must be an object/u
  );
});
