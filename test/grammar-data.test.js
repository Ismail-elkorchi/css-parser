import assert from "node:assert/strict";
import test from "node:test";

import { CSS_WEBREF_DATA } from "../dist/internal/generated/css-data.js";
import {
  CssValueDefinitionSyntaxError,
  parseCssValueDefinition
} from "../dist/internal/grammar/value-definition.js";

test("value-definition parsing applies the specified combinator precedence", () => {
  const grammar = parseCssValueDefinition("a b | c || d && e f");
  assert.equal(grammar.kind, "one-of");
  assert.deepEqual(grammar.values.map((value) => value.kind), [
    "sequence",
    "any-of"
  ]);
  assert.equal(grammar.values[1].values[1].kind, "all-of");
  assert.equal(grammar.values[1].values[1].values[1].kind, "sequence");
});

test("value-definition parsing retains references, ranges, functions, and multipliers", () => {
  const grammar = parseCssValueDefinition(
    "[ <'border-width'> || <length [0,∞]> ]#{1,4}?"
  );
  assert.equal(grammar.kind, "multiplier");
  assert.deepEqual(
    [grammar.minimum, grammar.maximum, grammar.separator],
    [0, 1, "space"]
  );
  assert.equal(grammar.value.kind, "multiplier");
  assert.deepEqual(
    [grammar.value.minimum, grammar.value.maximum, grammar.value.separator],
    [1, 4, "comma"]
  );
  assert.equal(grammar.value.value.kind, "any-of");
  assert.deepEqual(grammar.value.value.values[0], {
    kind: "reference",
    name: "border-width",
    referenceKind: "property",
    constraint: null,
    span: { start: 2, end: 18 }
  });
  assert.deepEqual(grammar.value.value.values[1].constraint, {
    kind: "range",
    value: {
      minimum: { value: 0, unit: null },
      maximum: { value: Number.POSITIVE_INFINITY, unit: null }
    }
  });

  const functionGrammar = parseCssValueDefinition(
    "color( [from <color>]? <number>{3} [ / <alpha-value> ]? )"
  );
  assert.equal(functionGrammar.kind, "function");
  assert.equal(functionGrammar.name, "color");
  assert.equal(functionGrammar.value.kind, "sequence");
});

test("value-definition parsing distinguishes parameterized and function references", () => {
  const parameter = parseCssValueDefinition("<boolean-expr[ <if-test> ]>");
  assert.deepEqual(parameter.constraint, {
    kind: "parameter",
    value: "<if-test>"
  });

  const functionReference = parseCssValueDefinition("<calc()>");
  assert.deepEqual(
    [functionReference.referenceKind, functionReference.name],
    ["function", "calc"]
  );
});

test("invalid value definitions fail at their exact boundary", () => {
  for (const source of ["", "a |", "[ a", "<length", "a{4,2}", "''"]) {
    assert.throws(
      () => parseCssValueDefinition(source),
      (error) =>
        error instanceof CssValueDefinitionSyntaxError &&
        Number.isSafeInteger(error.offset),
      source
    );
  }
});

test("the generated catalog contains the pinned canonical WebRef inventory", () => {
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(CSS_WEBREF_DATA).map(([name, values]) => [name, values.length])
    ),
    {
      properties: 817,
      atrules: 56,
      functions: 162,
      selectors: 158,
      types: 524
    }
  );

  const margin = CSS_WEBREF_DATA.properties.find(
    (property) => property.name === "margin"
  );
  assert.deepEqual(margin.longhands, [
    "margin-top",
    "margin-right",
    "margin-bottom",
    "margin-left"
  ]);
  assert.equal(margin.syntax, "<'margin-top'>{1,4}");

  const fontFace = CSS_WEBREF_DATA.atrules.find(
    (atRule) => atRule.name === "@font-face"
  );
  assert.ok(fontFace.descriptors.some(
    (descriptor) =>
      descriptor.name === "unicode-range" &&
      descriptor.syntax === "<unicode-range-token>#"
  ));
});

test("every generated grammar is accepted by the independent grammar parser", () => {
  const syntaxes = [];
  for (const property of CSS_WEBREF_DATA.properties) {
    if (property.syntax !== undefined) syntaxes.push(property.syntax);
  }
  for (const atRule of CSS_WEBREF_DATA.atrules) {
    if (atRule.syntax !== undefined) syntaxes.push(atRule.syntax);
    for (const descriptor of atRule.descriptors) {
      if (descriptor.syntax !== undefined) syntaxes.push(descriptor.syntax);
    }
  }
  for (const entries of [
    CSS_WEBREF_DATA.functions,
    CSS_WEBREF_DATA.selectors,
    CSS_WEBREF_DATA.types
  ]) {
    for (const entry of entries) {
      if (entry.syntax !== undefined) syntaxes.push(entry.syntax);
    }
  }

  assert.equal(syntaxes.length, 1688);
  for (const syntax of syntaxes) {
    assert.doesNotThrow(() => parseCssValueDefinition(syntax), syntax);
  }
});
