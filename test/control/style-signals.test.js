import assert from "node:assert/strict";
import test from "node:test";

import {
  extractInlineStyleSignals,
  extractStyleRuleSignals
} from "../../dist/mod.js";

test("extractStyleRuleSignals returns deterministic selector and cascade metadata", () => {
  const css = `
    .a, #b { color: red; display: none !important; }
    article > p.note { visibility: hidden; }
  `;

  const first = extractStyleRuleSignals(css);
  const second = extractStyleRuleSignals(css);

  assert.deepEqual(first, second);
  assert.equal(first.length, 2);

  assert.equal(first[0].cascadeOrder, 0);
  assert.equal(first[1].cascadeOrder, 1);
  assert.equal(first[0].selectorSupported, true);
  assert.equal(first[1].selectorSupported, true);

  assert.deepEqual(first[0].specificityMax, { a: 1, b: 0, c: 0 });
  assert.deepEqual(first[1].specificityMax, { a: 0, b: 1, c: 2 });

  assert.deepEqual(
    first[0].declarations.map((entry) => ({
      property: entry.property,
      value: entry.value,
      important: entry.important,
      declarationOrder: entry.declarationOrder
    })),
    [
      {
        property: "color",
        value: "red",
        important: false,
        declarationOrder: 0
      },
      {
        property: "display",
        value: "none",
        important: true,
        declarationOrder: 1
      }
    ]
  );
});

test("extractStyleRuleSignals supports strict and permissive unsupported-selector policy", () => {
  const css = `
    a:hover { color: red; }
    a[href] { display: block; }
  `;

  const defaultSignals = extractStyleRuleSignals(css);
  assert.equal(defaultSignals.length, 1);
  assert.equal(defaultSignals[0].selectorSupported, true);

  const permissiveSignals = extractStyleRuleSignals(css, {
    includeUnsupportedSelectors: true
  });
  assert.equal(permissiveSignals.length, 2);
  assert.equal(permissiveSignals[0].selectorSupported, false);
  assert.equal(permissiveSignals[1].selectorSupported, true);

  assert.throws(
    () => extractStyleRuleSignals(css, {
      includeUnsupportedSelectors: true,
      strictSelectors: true
    }),
    /unsupported selector in strict mode/
  );
});

test("extractInlineStyleSignals returns deterministic declaration ordering", () => {
  const first = extractInlineStyleSignals("color: red; margin: 0 !important; --Token: 1px;");
  const second = extractInlineStyleSignals("color: red; margin: 0 !important; --Token: 1px;");

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.map((entry) => ({
      property: entry.property,
      value: entry.value,
      important: entry.important,
      declarationOrder: entry.declarationOrder
    })),
    [
      {
        property: "color",
        value: "red",
        important: false,
        declarationOrder: 0
      },
      {
        property: "margin",
        value: "0",
        important: true,
        declarationOrder: 1
      },
      {
        property: "--token",
        value: "1px",
        important: false,
        declarationOrder: 2
      }
    ]
  );
});
