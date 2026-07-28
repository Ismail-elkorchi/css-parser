import assert from "node:assert/strict";
import test from "node:test";

import {
  CssTokenizer,
  tokenizeCss
} from "../dist/internal/syntax/tokenizer.js";
import { SyntaxResourceError } from "../dist/internal/syntax/resources.js";

function simplify(input, options) {
  return tokenizeCss(input, options).tokens.map((token) => {
    const result = { kind: token.kind };
    for (const key of [
      "value",
      "hashType",
      "numberType",
      "representation",
      "sign",
      "unit",
      "start",
      "end"
    ]) {
      if (key in token) result[key] = token[key];
    }
    return result;
  });
}

test("tokenizer emits the complete punctuation and compatibility token set", () => {
  assert.deepEqual(
    simplify(" \t\n<!-- --> :;,[](){}"),
    [
      { kind: "whitespace" },
      { kind: "cdo" },
      { kind: "whitespace" },
      { kind: "cdc" },
      { kind: "whitespace" },
      { kind: "colon" },
      { kind: "semicolon" },
      { kind: "comma" },
      { kind: "open-square" },
      { kind: "close-square" },
      { kind: "open-paren" },
      { kind: "close-paren" },
      { kind: "open-curly" },
      { kind: "close-curly" }
    ]
  );
});

test("tokenizer decodes identifiers, hashes, at-keywords, functions, and URLs", () => {
  assert.deepEqual(
    simplify(String.raw`foo \66 oo --x @media #id #123 calc( url(foo\ bar) url("quoted")`),
    [
      { kind: "ident", value: "foo" },
      { kind: "whitespace" },
      { kind: "ident", value: "foo" },
      { kind: "whitespace" },
      { kind: "ident", value: "--x" },
      { kind: "whitespace" },
      { kind: "at-keyword", value: "media" },
      { kind: "whitespace" },
      { kind: "hash", value: "id", hashType: "id" },
      { kind: "whitespace" },
      { kind: "hash", value: "123", hashType: "unrestricted" },
      { kind: "whitespace" },
      { kind: "function", value: "calc" },
      { kind: "whitespace" },
      { kind: "url", value: "foo bar" },
      { kind: "whitespace" },
      { kind: "function", value: "url" },
      { kind: "string", value: "quoted" },
      { kind: "close-paren" }
    ]
  );
});

test("tokenizer preserves numeric semantics", () => {
  assert.deepEqual(
    simplify("1 -2 +.5 1. 1e3 -2.5E-2px 30%"),
    [
      { kind: "number", value: 1, numberType: "integer", representation: "1", sign: null },
      { kind: "whitespace" },
      { kind: "number", value: -2, numberType: "integer", representation: "-2", sign: "-" },
      { kind: "whitespace" },
      { kind: "number", value: 0.5, numberType: "number", representation: "+.5", sign: "+" },
      { kind: "whitespace" },
      { kind: "number", value: 1, numberType: "integer", representation: "1", sign: null },
      { kind: "delim", value: 46 },
      { kind: "whitespace" },
      { kind: "number", value: 1000, numberType: "number", representation: "1e3", sign: null },
      { kind: "whitespace" },
      {
        kind: "dimension",
        value: -0.025,
        numberType: "number",
        representation: "-2.5E-2",
        sign: "-",
        unit: "px"
      },
      { kind: "whitespace" },
      { kind: "percentage", value: 30, numberType: "integer", representation: "30", sign: null }
    ]
  );
});

test("tokenizer only parses Unicode ranges in the descriptor context", () => {
  assert.deepEqual(simplify("U+26"), [
    { kind: "ident", value: "U" },
    { kind: "number", value: 26, numberType: "integer", representation: "+26", sign: "+" }
  ]);
  assert.deepEqual(
    simplify("U+26 U+0-7F u+4?? U+123456-10FFFF", { unicodeRanges: true }),
    [
      { kind: "unicode-range", start: 0x26, end: 0x26 },
      { kind: "whitespace" },
      { kind: "unicode-range", start: 0, end: 0x7f },
      { kind: "whitespace" },
      { kind: "unicode-range", start: 0x400, end: 0x4ff },
      { kind: "whitespace" },
      { kind: "unicode-range", start: 0x123456, end: 0x10ffff }
    ]
  );
});

test("quoted URLs preserve the significant whitespace left by CSS tokenization", () => {
  assert.deepEqual(simplify("url(  \"x\")"), [
    { kind: "function", value: "url" },
    { kind: "whitespace" },
    { kind: "string", value: "x" },
    { kind: "close-paren" }
  ]);
});

test("tokenizer reports exact recovery diagnostics", () => {
  const cases = [
    ["/*", "unexpected-eof-in-comment"],
    ["\"x", "unexpected-eof-in-string"],
    ["\"x\n", "newline-in-string"],
    ["\\\n", "invalid-escape"],
    ["url(x", "unexpected-eof-in-url"],
    ["url(\"x)", "unexpected-eof-in-string"],
    ["url(x y)", "invalid-url"]
  ];
  for (const [source, code] of cases) {
    assert.ok(tokenizeCss(source).errors.some((error) => error.code === code), source);
  }
});

test("tokenizer spans map to raw UTF-16 input", () => {
  const result = tokenizeCss("😀\r\n.x");
  assert.deepEqual(
    result.tokens.map((token) => [token.kind, token.span.start.offset, token.span.end.offset]),
    [
      ["ident", 0, 2],
      ["whitespace", 2, 4],
      ["delim", 4, 5],
      ["ident", 5, 6]
    ]
  );
});

test("identifier starts follow the current restricted non-ASCII ranges", () => {
  assert.deepEqual(simplify("·foo ×foo \u202efoo 😀foo"), [
    { kind: "ident", value: "·foo" },
    { kind: "whitespace" },
    { kind: "delim", value: 0xd7 },
    { kind: "ident", value: "foo" },
    { kind: "whitespace" },
    { kind: "delim", value: 0x202e },
    { kind: "ident", value: "foo" },
    { kind: "whitespace" },
    { kind: "ident", value: "😀foo" }
  ]);
});

test("a terminal reverse solidus is a delimiter rather than an EOF escape", () => {
  assert.deepEqual(simplify("a\\"), [
    { kind: "ident", value: "a" },
    { kind: "delim", value: 0x5c }
  ]);
  assert.ok(tokenizeCss("\\").errors.some((error) => error.code === "invalid-escape"));
  assert.equal(
    tokenizeCss("\\").errors.some((error) => error.code === "unexpected-eof-in-escape"),
    false
  );
});

test("tokenizer enforces token and step limits during work", () => {
  assert.throws(
    () => tokenizeCss("a b", { limits: { maxTokens: 1 } }),
    (error) => error instanceof SyntaxResourceError && error.limitName === "maxTokens"
  );
  assert.throws(
    () => tokenizeCss("abcdef", { limits: { maxSteps: 2 } }),
    (error) => error instanceof SyntaxResourceError && error.limitName === "maxSteps"
  );
});

test("tokenization is invariant across every UTF-16 chunk boundary", () => {
  const inputs = [
    String.raw`.foo\+bar{width:-2.5e-2px}`,
    String.raw`@media (width >= 40rem){a[href^="https" i]{color:red}}`,
    String.raw`:root{--x:url(foo\ bar);unicode-range:U+4??}`,
    "a\r\nb😀c/* comment */d"
  ];
  for (const input of inputs) {
    const expected = tokenizeCss(input);
    for (let split = 0; split <= input.length; split += 1) {
      const chunks = [input.slice(0, split), input.slice(split)];
      assert.deepEqual(tokenizeCss(chunks.join("")), expected, `${JSON.stringify(input)} @ ${split}`);
    }
  }
});

test("tokenizer next returns one stable EOF token after completion", () => {
  const tokenizer = new CssTokenizer("");
  const first = tokenizer.next();
  const second = tokenizer.next();
  assert.equal(first.kind, "eof");
  assert.deepEqual(second, first);
});
