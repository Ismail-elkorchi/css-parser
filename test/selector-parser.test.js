import assert from "node:assert/strict";
import test from "node:test";

import {
  parseSelectorList,
  parseSelectorListFromComponentValues,
  parseStylesheet,
  specificitiesOfSelectorList,
  SyntaxResourceError
} from "../dist/mod.js";

function parse(source) {
  const result = parseSelectorList(source);
  assert.equal(result.ok, true, `${source}: ${JSON.stringify(result.errors)}`);
  if (!result.ok) throw new Error(`Could not parse ${source}`);
  return result.value;
}

test("selector parser covers namespaces, combinators, and attribute modifiers", () => {
  const selector = parse(
    "svg|a#target.card[data-name^=\"A\" i] > *|g + |path ~ rect"
  ).selectors[0];
  assert.deepEqual(selector.combinators, [">", "+", "~"]);
  assert.deepEqual(
    selector.compounds.map((compound) => [
      compound.type?.namespace,
      compound.type?.name,
      compound.simples.map((simple) => simple.kind)
    ]),
    [
      ["svg", "a", ["id", "class", "attribute"]],
      ["*", "g", []],
      ["", "path", []],
      [null, "rect", []]
    ]
  );
  const attribute = selector.compounds[0].simples[2];
  assert.deepEqual(
    [attribute.matcher, attribute.value, attribute.modifier],
    ["^=", "A", "i"]
  );
});

test("functional selectors retain nested and relative selector structure", () => {
  const selector = parse(
    "article:is(.featured, #lead):not(:empty):has(> img, + aside)"
  ).selectors[0];
  const pseudos = selector.compounds[0].simples.filter(
    (simple) => simple.kind === "pseudo-class"
  );
  assert.deepEqual(pseudos.map((pseudo) => pseudo.name), [
    "is",
    "not",
    "has"
  ]);
  assert.equal(pseudos[0].argument.selectors.length, 2);
  assert.deepEqual(
    pseudos[2].argument.selectors.map((nested) => nested.leadingCombinator),
    [">", "+"]
  );
});

test("selector parser consumes a retained qualified-rule prelude without tokenizing it again", () => {
  const stylesheet = parseStylesheet(
    "article:is(.featured, #lead) > a[href^='/docs'] { color: red }"
  );
  assert.equal(stylesheet.ok, true);
  if (!stylesheet.ok) return;
  const rule = stylesheet.value.rules[0];
  assert.equal(rule?.kind, "qualified-rule");
  if (rule?.kind !== "qualified-rule") return;
  const retainedPrelude = rule.prelude;
  const parsed = parseSelectorListFromComponentValues(retainedPrelude);
  const fromText = parseSelectorList("article:is(.featured, #lead) > a[href^='/docs']");
  assert.equal(parsed.ok, true);
  assert.equal(fromText.ok, true);
  if (!parsed.ok || !fromText.ok) return;
  assert.deepEqual(parsed.value, fromText.value);
  assert.strictEqual(rule.prelude, retainedPrelude);
  assert.equal(parsed.usage.inputBytes, 0);
  assert.equal(parsed.usage.tokens, 0);
  assert.ok(parsed.usage.nodes > 0);
  assert.throws(
    () => parseSelectorListFromComponentValues(retainedPrelude, { limits: { maxSteps: 0 } }),
    (error) => error instanceof SyntaxResourceError && error.limitName === "maxSteps"
  );
});

test("selector lists ignore surrounding whitespace in top-level and nested branches", () => {
  assert.equal(parseSelectorList("  article > a  ").ok, true);
  assert.equal(parseSelectorList(":is(.card, #lead )").ok, true);
});

test("An+B arguments and of selector lists are typed", () => {
  const selector = parse("li:nth-child(2n + 1 of .item, #featured)")
    .selectors[0];
  const pseudo = selector.compounds[0].simples[0];
  assert.equal(pseudo.kind, "pseudo-class");
  assert.deepEqual(
    [pseudo.argument.kind, pseudo.argument.a, pseudo.argument.b],
    ["nth", 2, 1]
  );
  assert.equal(pseudo.argument.of.length, 2);
});

test("specificity implements Level 4 replacement rules", () => {
  const list = parse(
    ":where(#zero).item, :is(.class, #id), " +
    "li:nth-child(odd of .item, #featured), ::slotted(#target)"
  );
  assert.deepEqual(specificitiesOfSelectorList(list), [
    { a: 0, b: 1, c: 0 },
    { a: 1, b: 0, c: 0 },
    { a: 1, b: 1, c: 1 },
    { a: 1, b: 0, c: 1 }
  ]);
});

test("nesting specificity uses the parent list maximum or zero", () => {
  const list = parse("& > .child");
  assert.deepEqual(specificitiesOfSelectorList(list), [
    { a: 0, b: 1, c: 0 }
  ]);
  assert.deepEqual(
    specificitiesOfSelectorList(list, {
      nesting: { a: 1, b: 0, c: 0 }
    }),
    [
      { a: 1, b: 1, c: 0 }
    ]
  );
});

test("forgiving selector lists discard invalid alternatives", () => {
  const result = parseSelectorList(":is(.valid, > invalid, #also-valid)");
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  if (!result.ok) return;
  const selector = result.value.selectors[0];
  const pseudo = selector.compounds[0].simples[0];
  assert.equal(pseudo.argument.kind, "selector-list");
  assert.equal(pseudo.argument.selectors.length, 2);
});

test("pseudo-element chains follow the Level 4 compound grammar", () => {
  const selector = parse("::before::marker:hover").selectors[0];
  assert.deepEqual(
    selector.compounds[0].simples.map((simple) => simple.kind),
    ["pseudo-element", "pseudo-element", "pseudo-class"]
  );
  assert.equal(parseSelectorList("::before.example").ok, false);
});

test("invalid top-level selectors fail with exact selector diagnostics", () => {
  for (const source of [
    "",
    "a >",
    "a,,b",
    "[name?=value]",
    ":nth-child(nope)",
    ":nth-of-type(2n of .item)",
    "a || b",
    ":not(.valid, > invalid)",
    ":not(::before)",
    ":has(.item, >)",
    ":has(::before)",
    ":has(:has(.nested))",
    ":future-library-pseudo",
    ":future-library-pseudo()",
    "::future-library-pseudo",
    "::future-library-pseudo()",
    ":matches(.obsolete)"
  ]) {
    const result = parseSelectorList(source);
    assert.equal(result.ok, false, source);
    assert.ok(result.errors.some((error) => error.kind === "selector"), source);
  }
});

test("known pseudo selectors enforce their functional form and arguments", () => {
  for (const source of [
    ":root(foo)",
    ":hover(foo)",
    ":nth-child",
    ":is",
    ":dir()",
    ":dir(ltr rtl)",
    ":lang()",
    ":lang(en,)",
    "::before(foo)",
    "::slotted"
  ]) {
    assert.equal(parseSelectorList(source).ok, false, source);
  }
  for (const source of [
    ":root",
    ":hover",
    ":nth-child(2n+1)",
    ":is(.item)",
    ":dir(ltr)",
    ":dir(sideways)",
    ":lang(en, \"*-Latn\")",
    "::before",
    "::slotted(.item)"
  ]) {
    assert.equal(parseSelectorList(source).ok, true, source);
  }
});

test("selector parsing enforces deterministic work and node limits", () => {
  assert.throws(
    () => parseSelectorList("article > .card", { limits: { maxSteps: 0 } }),
    (error) =>
      error instanceof SyntaxResourceError &&
      error.limitName === "maxSteps"
  );
  assert.throws(
    () => parseSelectorList("article > .card", { limits: { maxNodes: 0 } }),
    (error) =>
      error instanceof SyntaxResourceError &&
      error.limitName === "maxNodes"
  );
});
