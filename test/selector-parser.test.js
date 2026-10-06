import assert from "node:assert/strict";
import test from "node:test";

import {
  cloneCssComponentValues,
  parseComponentValues,
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

test("fatal components cannot leave a valid prefix in any complex or strict list", () => {
  const suffixes = [":future-pseudo", ":future-pseudo()", "::future-pseudo", "::future-pseudo()",
    ":hover(x)", ":nth-child(nope)", ":nth-child(2 of :future-pseudo)", "[x?=y]", "[]", ":not(.ok,:future-pseudo)", ":has(> .ok, :future-pseudo)"];
  for (const prefix of ["p", "#id", ".class", "[id]", "&", "section > p"]) {
    for (const suffix of suffixes) {
      const invalid = `${prefix}${suffix}`;
      for (const source of [invalid, `${invalid}, .ok`, `.ok, ${invalid}`, `.ok, ${invalid}, #other`]) {
        const result = parseSelectorList(source);
        assert.equal(result.ok, false, source);
        assert.equal("value" in result, false, source);
        assert.ok(result.errors.length > 0, source);
      }
      for (const pseudo of ["is", "where"]) {
        const result = parse(`:${pseudo}(${invalid}, .ok)`);
        assert.equal(result.selectors[0].compounds[0].simples[0].argument.selectors.length, 1, invalid);
        assert.equal(result.source.discardedInvalidBranches.length, 1, invalid);
      }
    }
  }
});

test("unknown WebKit pseudo-elements are valid, lowercased, and retain their AST", () => {
  const value = parse("p::-WeBkIt-future, .ordinary");
  assert.equal(value.selectors.length, 2);
  assert.equal(value.selectors[0].compounds[0].simples[0].name, "-webkit-future");
  assert.equal(value.selectors[0].compounds[0].simples[0].kind, "pseudo-element");
  assert.deepEqual(value.source.discardedInvalidBranches, []);
  for (const source of ["p::-webkit-future()", "p:-webkit-future", "p::-moz-future", "p::future"])
    assert.equal(parseSelectorList(source).ok, false, source);
  assert.equal(parse(":-WEBKIT-autofill").selectors[0].compounds[0].simples[0].name, "autofill");
});

test("selector recovery and original nesting provenance remain immutable and source-located", () => {
  const css = "\n.a { :is(.ok, :future(&), :where(.other, .bad:future-test)), .plain {} }";
  const stylesheet = parseStylesheet(css);
  assert.equal(stylesheet.ok, true);
  const nested = stylesheet.value.rules[0].block.items.find((item) => item.kind === "qualified-rule");
  const parsed = parseSelectorListFromComponentValues(nested.prelude);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.errors, []);
  const { source, selectors } = parsed.value;
  assert.equal(selectors[0].source.containsNesting, true);
  assert.equal(selectors[1].source.containsNesting, false);
  assert.deepEqual(source.discardedInvalidBranches.map((span) => css.slice(span.start.offset, span.end.offset)),
    [":future(&)", ".bad:future-test"]);
  assert.ok(Object.isFrozen(source));
  assert.ok(Object.isFrozen(source.discardedInvalidBranches));
  assert.ok(Object.isFrozen(source.discardedInvalidBranches[0]));
  assert.ok(Object.isFrozen(selectors[0].source));
  assert.equal(parsed.usage.inputBytes, 0);
  assert.equal(parsed.usage.tokens, 0);
  assert.equal(parse(':is([value="&"], .ok)').selectors[0].source.containsNesting, false);
  assert.equal(parse(':is(:future(nested(&)), .ok)').selectors[0].source.containsNesting, true);
});

test("An+B and attributes preserve token grammar rather than joining malformed input", () => {
  for (const formula of ["2n foo()", "2n []", "2n,", "3 n", "+ 2n", "+ n", "2 n+1", "n 2", "n + -2", "n- +2", "1.0n", "2n 1.0"]) {
    assert.equal(parseSelectorList(`p:nth-child(${formula})`).ok, false, formula);
  }
  for (const formula of ["odd", "even", "+2", "-2n+3", "+n-2", "n- 2", "2n- 2", "-n- 2", "2n + 3", "2n - 3", "n/**/+/**/2"]) {
    assert.equal(parseSelectorList(`p:nth-child(${formula})`).ok, true, formula);
  }
  for (const attribute of ['["bad"|name]', '[a |b]', '[a| b]', '[a~ =b]', '[a b]', '[a=b x]']) {
    assert.equal(parseSelectorList(`p${attribute}`).ok, false, attribute);
  }
  for (const attribute of ['[a |= b]', '[ns|a ~= "b" i]', '[|a]', '[*|a]', '[a="b"s]']) {
    assert.equal(parseSelectorList(`p${attribute}`).ok, true, attribute);
  }
  assert.equal(parseSelectorList("p::slotted(.a .b)").ok, false);
});

test("source provenance scans and forgiving recovery obey parser bounds and cancellation", () => {
  const stylesheet = parseStylesheet(`p:is(.valid, :future(${"nested(".repeat(30)}&${")".repeat(30)})) {}`);
  const values = stylesheet.value.rules[0].prelude;
  assert.throws(() => parseSelectorListFromComponentValues(values, { limits: { maxSteps: 20 } }), SyntaxResourceError);
  assert.throws(() => parseSelectorListFromComponentValues(values, { limits: { maxDepth: 10 } }), SyntaxResourceError);
  assert.throws(() => parseSelectorListFromComponentValues(values, { limits: { maxNodes: 1 } }), SyntaxResourceError);
  const controller = new AbortController();
  controller.abort();
  assert.throws(() => parseSelectorListFromComponentValues(values, { signal: controller.signal }), { name: "SyntaxAbortError" });
  for (const source of ["a,", ",a", "a,,b"]) assert.equal(parseSelectorList(source).ok, false, source);
  for (const source of [":is(a,)", ":is(,a)", ":is(a,,b)", ":where()"])
    assert.ok(parse(source).source.discardedInvalidBranches.length > 0, source);
});

test("empty forgiving branch spans point inside arguments, including escapes, comments, and EOF", () => {
  const cases = [
    [":is()", 4, 4], [":is(,.a)", 4, 4], [":is(   , .a)", 4, 7],
    [":is(.a, )", 7, 8], [":is(.a,, .b)", 7, 7],
    [":is(/*c*/, .a)", 9, 9], [":is(/*c*/)", 9, 9],
    [":is(", 4, 4], [":is(/*c*/", 9, 9],
    [String.raw`:i\73()`, 6, 6], [String.raw`:i\73 (,.a)`, 7, 7],
    ["\n  :is(\n \t, .a)", 7, 10], [":is(:where(/*c*/))", 16, 16],
  ];
  const location = (source, offset) => {
    const lines = source.slice(0, offset).split("\n");
    return { offset, line: lines.length, column: lines.at(-1).length + 1 };
  };
  for (const [source, start, end] of cases) {
    const expected = { start: location(source, start), end: location(source, end) };
    const parsed = parse(source);
    assert.deepEqual(parsed.source.discardedInvalidBranches, [expected], source);
    const components = parseComponentValues(source);
    assert.equal(components.ok, true, source);
    for (const values of [components.value, cloneCssComponentValues(components.value)]) {
      const result = parseSelectorListFromComponentValues(values);
      assert.equal(result.ok, true, source);
      assert.deepEqual(result.value.source.discardedInvalidBranches, [expected], source);
    }
  }
  const prefix = "/*leading*/\n.outer {\n  ";
  for (const [selector, start, end] of cases.filter(([source]) => source.endsWith(")"))) {
    const source = `${prefix}${selector} { color: red } }`;
    const stylesheet = parseStylesheet(source);
    const nested = stylesheet.value.rules[0].block.items.find((item) => item.kind === "qualified-rule");
    const result = parseSelectorListFromComponentValues(nested.prelude);
    assert.equal(result.ok, true, selector);
    assert.deepEqual(result.value.source.discardedInvalidBranches, [{
      start: location(source, prefix.length + start), end: location(source, prefix.length + end)
    }], selector);
  }
});

test("pseudo-element name compatibility does not permit invalid structures or state selectors", () => {
  for (const source of ["p::-webkit-test > p", "p::-webkit-test + p", "p::-webkit-test ~ p", "p::-webkit-test p",
    "p::-webkit-test::-webkit-other", "p::-webkit-test::before", "p::before::-webkit-test",
    "p::first-line::-webkit-test", "p::selection::-webkit-test", "p::backdrop::-webkit-test",
    "p::-webkit-test:first-child", "p::-webkit-test:nth-child(1)", "p::-webkit-test:not(:first-child)",
    "p::-webkit-test:not(.class)", "p::-webkit-test:is(:hover) > p"]) {
    assert.equal(parseSelectorList(source).ok, false, source);
    assert.equal(parseSelectorList(`${source}, .target`).ok, false, source);
  }
  for (const source of ["p::-webkit-test:hover", "p::-webkit-test:active", "p::-webkit-test:focus-within",
    "p::-webkit-test:not(:hover)", "p::-webkit-test:is(:hover,:active)", "::before::marker:hover",
    "x::part(button):disabled", "x::part(button):checked", "x::part(button):not(:disabled)",
    "x::part(button)::-webkit-test", "input::file-selector-button::-webkit-test", "details::details-content::-webkit-test"]) {
    assert.equal(parseSelectorList(source).ok, true, source);
  }
  for (const source of ["p::-webkit-test:is(:first-child,:hover)", "p::-webkit-test:where(.class,:active)"]) {
    const result = parse(source);
    assert.equal(result.source.discardedInvalidBranches.length, 1, source);
    assert.equal(result.selectors[0].compounds[0].simples.at(-1).argument.selectors.length, 1, source);
  }
});
