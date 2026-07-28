import assert from "node:assert/strict";
import test from "node:test";

import {
  parseCssDeclaration,
  parseCssStylesheet
} from "../dist/internal/syntax/parser.js";
import {
  CssSerializationError,
  serializeCssSyntax
} from "../dist/internal/syntax/serialize.js";

function semantic(value) {
  if (Array.isArray(value)) return value.map(semantic);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !["id", "span", "originalText"].includes(key))
      .map(([key, child]) => [key, semantic(child)])
  );
}

function parseStylesheetOrThrow(source) {
  const result = parseCssStylesheet(source);
  assert.equal(result.ok, true, source);
  if (!result.ok) throw new Error("stylesheet parse failed");
  return result.value;
}

test("structural serialization preserves parsed syntax", () => {
  const cases = [
    "a{color:red;margin:-2.5e-2px}",
    "@layer reset;@media(width>1px){a{--x:[a]{b:c} d}}",
    "@font-face{unicode-range:U+0-7F, U+4??;src:url(foo\\ bar)}",
    String.raw`.foo{content:"a\a b";x:1e\32 px}`,
    "a{x:a/**/b;y:@a/**/-2px;z:#123/**/abc;q:1/**/%}"
  ];

  for (const source of cases) {
    const first = parseStylesheetOrThrow(source);
    const serialized = serializeCssSyntax(first);
    const second = parseStylesheetOrThrow(serialized);
    assert.deepEqual(semantic(second), semantic(first), `${source} => ${serialized}`);
  }
});

test("serializer inserts comments at token-merging boundaries", () => {
  const source = parseStylesheetOrThrow(
    "a{x:a/**/b;y:@a/**/-2px;z:#123/**/abc;q:1/**/%}"
  );
  const serialized = serializeCssSyntax(source);
  assert.match(serialized, /a\/\*\*\/b/u);
  assert.match(serialized, /@a\/\*\*\/-2/u);
  assert.match(serialized, /#123\/\*\*\/abc/u);
  assert.match(serialized, /1\/\*\*\/%/u);
});

test("all CSS Syntax token-boundary classes survive structural round trips", () => {
  const rows = [
    "a",
    "@a",
    "#a",
    "#1",
    "1px",
    "#",
    "-",
    "1",
    "@",
    ".",
    "+",
    "/"
  ];
  const columns = [
    "b",
    "f()",
    "url(x)",
    "url(()",
    "-",
    "2",
    "2%",
    "2px",
    "-->",
    "()",
    "*",
    "%"
  ];
  for (const left of rows) {
    for (const right of columns) {
      const source = `--x:${left}/**/${right}`;
      const parsed = parseCssDeclaration(source);
      assert.equal(parsed.ok, true, source);
      if (!parsed.ok) continue;
      const serialized = serializeCssSyntax(parsed.value);
      const reparsed = parseCssDeclaration(serialized);
      assert.equal(reparsed.ok, true, serialized);
      if (reparsed.ok) {
        assert.deepEqual(
          semantic(reparsed.value),
          semantic(parsed.value),
          `${source} => ${serialized}`
        );
      }
    }
  }
});

test("dimension serialization cannot be reinterpreted as an exponent", () => {
  const declaration = parseCssDeclaration(String.raw`x:1e\32 px`);
  assert.equal(declaration.ok, true);
  if (!declaration.ok) return;

  const serialized = serializeCssSyntax(declaration.value);
  const reparsed = parseCssDeclaration(serialized);
  assert.equal(reparsed.ok, true);
  if (!reparsed.ok) return;
  assert.deepEqual(semantic(reparsed.value), semantic(declaration.value));
  assert.match(serialized, /\\65 /u);
});

test("dimension serialization leaves ordinary identifier units readable", () => {
  const declaration = parseCssDeclaration("width:1px");
  assert.equal(declaration.ok, true);
  if (!declaration.ok) return;
  assert.equal(serializeCssSyntax(declaration.value), "width:1px;");
});

test("restricted identifier code points are escaped and round-trip", () => {
  const declaration = parseCssDeclaration(String.raw`x:\202e name`);
  assert.equal(declaration.ok, true);
  if (!declaration.ok) return;

  const serialized = serializeCssSyntax(declaration.value);
  assert.match(serialized, /\\202e /u);
  const reparsed = parseCssDeclaration(serialized);
  assert.equal(reparsed.ok, true);
  if (reparsed.ok) {
    assert.deepEqual(semantic(reparsed.value), semantic(declaration.value));
  }
});

test("serializer rejects cycles and shared syntax objects", () => {
  const span = {
    start: { offset: 0, line: 1, column: 1 },
    end: { offset: 0, line: 1, column: 1 }
  };
  const cyclic = { id: 1, kind: "block", items: [], span };
  cyclic.items.push(cyclic);
  assert.throws(
    () => serializeCssSyntax(cyclic),
    (error) => error instanceof CssSerializationError && error.code === "cyclic-structure"
  );

  const token = { kind: "ident", value: "x", span };
  const shared = {
    id: 1,
    kind: "declaration",
    name: "x",
    value: [token, token],
    important: false,
    span
  };
  assert.throws(
    () => serializeCssSyntax(shared),
    (error) => error instanceof CssSerializationError && error.code === "shared-structure"
  );
});

test("serializer rejects duplicate IDs and malformed runtime structures", () => {
  const parsed = parseStylesheetOrThrow("a{x:f();y:g()}");
  const first = parsed.rules[0].block.items[0].value[0];
  const second = parsed.rules[0].block.items[1].value[0];
  const invalid = {
    ...parsed,
    rules: [{
      ...parsed.rules[0],
      block: {
        ...parsed.rules[0].block,
        items: [
          {
            ...parsed.rules[0].block.items[0],
            value: [first, { ...second, id: first.id }]
          }
        ]
      }
    }]
  };
  assert.throws(
    () => serializeCssSyntax(invalid),
    (error) => error instanceof CssSerializationError && error.code === "duplicate-node-id"
  );

  assert.throws(
    () => serializeCssSyntax({ kind: "stylesheet", id: 0, rules: [], span: null }),
    (error) => error instanceof CssSerializationError && error.code === "invalid-structure"
  );
});

test("tokens without an isolated round-trip representation fail explicitly", () => {
  const declaration = parseCssDeclaration("x: \"broken\n");
  assert.equal(declaration.ok, true);
  if (!declaration.ok) return;
  assert.throws(
    () => serializeCssSyntax(declaration.value),
    (error) => error instanceof CssSerializationError && error.code === "unserializable-token"
  );
});

test("bad URL recovery tokens have an explicit round-trip form", () => {
  const declaration = parseCssDeclaration("x:url(()");
  assert.equal(declaration.ok, true);
  if (!declaration.ok) return;
  const serialized = serializeCssSyntax(declaration.value);
  const reparsed = parseCssDeclaration(serialized);
  assert.equal(reparsed.ok, true);
  if (reparsed.ok) {
    assert.deepEqual(semantic(reparsed.value), semantic(declaration.value));
  }
});

test("manual delimiter adjacency is serialized without becoming a comment or CDO", () => {
  const span = {
    start: { offset: 0, line: 1, column: 1 },
    end: { offset: 1, line: 1, column: 2 }
  };
  const declaration = {
    id: 1,
    kind: "declaration",
    name: "x",
    value: [
      { kind: "delim", value: 0x2f, span },
      { kind: "delim", value: 0x2a, span },
      { kind: "delim", value: 0x3c, span },
      { kind: "delim", value: 0x21, span },
      { kind: "delim", value: 0x2d, span },
      { kind: "delim", value: 0x2d, span }
    ],
    important: false,
    span
  };
  const serialized = serializeCssSyntax(declaration);
  const reparsed = parseCssDeclaration(serialized);
  assert.equal(reparsed.ok, true);
  if (reparsed.ok) {
    assert.deepEqual(
      reparsed.value.value.map((token) => [token.kind, token.value]),
      declaration.value.map((token) => [token.kind, token.value])
    );
  }
});
