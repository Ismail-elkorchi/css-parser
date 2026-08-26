import assert from "node:assert/strict";
import test from "node:test";

import {
  parseDeclaration as parseCssDeclaration,
  resolveCssProperty,
  SyntaxResourceError,
  validateCssPropertyValue
} from "../dist/mod.js";

function parseDeclaration(source) {
  const result = parseCssDeclaration(source);
  assert.equal(result.ok, true, source);
  if (!result.ok) throw new Error(`Unable to parse ${source}`);
  return result.value;
}

function validate(source, options) {
  return validateCssPropertyValue(parseDeclaration(source), options);
}

test("property resolution is ASCII-insensitive and canonicalizes legacy aliases", () => {
  const color = resolveCssProperty("CoLoR");
  assert.equal(color.kind, "standard");
  assert.deepEqual(
    [color.requestedName, color.name, color.legacyAlias, color.inherited],
    ["color", "color", false, "yes"]
  );

  const alias = resolveCssProperty("-WEBKIT-ALIGN-CONTENT");
  assert.equal(alias.kind, "standard");
  assert.deepEqual(
    [alias.requestedName, alias.name, alias.legacyAlias],
    ["-webkit-align-content", "align-content", true]
  );

  assert.deepEqual(resolveCssProperty("--Theme"), {
    kind: "custom",
    name: "--Theme"
  });
  assert.equal(resolveCssProperty("--"), null);
});

test("property validation recognizes CSS-wide and custom-property values", () => {
  const wide = validate("color: ReVeRt-LaYeR");
  assert.equal(wide.status, "valid");
  assert.equal(wide.valueKind, "css-wide");

  const custom = validate("--Theme: [anything] {is:preserved}");
  assert.equal(custom.status, "valid");
  assert.equal(custom.valueKind, "custom");
  assert.equal(custom.property.name, "--Theme");

  assert.equal(validate("--Theme: var(--fallback,)").status, "valid");
  assert.equal(validate("--Theme: var(not-a-custom-property)").status, "invalid");
  const dynamic = validate("--Theme: var(var(--property-name))");
  assert.equal(dynamic.status, "unsupported");
  assert.equal(dynamic.reason, "dynamic-custom-property-reference");
  assert.equal(validate("--Theme: \"line\nbreak").status, "invalid");
});

test("property validation follows generated repetitions, ranges, and aliases", () => {
  for (const source of [
    "margin: 1px 2% auto",
    "font-size: 12px",
    "opacity: .5",
    "fill: black",
    "stroke: url(#paint) red",
    "-webkit-align-content: center"
  ]) {
    assert.equal(validate(source).status, "valid", source);
  }

  for (const source of [
    "margin: 1px 2px 3px 4px 5px",
    "font-size: -2px",
    "color: 20px"
  ]) {
    assert.equal(validate(source).status, "invalid", source);
  }
});

test("all-of matching permits components in any order without splitting them", () => {
  for (const source of [
    "border: solid red 1px",
    "border: red 1px solid",
    "box-shadow: inset 1px 2px red, blue 3px 4px"
  ]) {
    assert.equal(validate(source).status, "valid", source);
  }
  assert.equal(validate("box-shadow: 1px red 2px").status, "invalid");
  assert.equal(validate("box-shadow: 1px solid red").status, "invalid");
});

test("sequence matching applies conditional comma omission", () => {
  for (const source of [
    "background: red",
    "background: url(image.png) no-repeat center / cover",
    "background: url(first.png), red"
  ]) {
    assert.equal(validate(source).status, "valid", source);
  }
  assert.equal(validate("background: red, blue").status, "invalid");
});

test("typed CSS math validates dimensions for calc, min, max, and clamp", () => {
  for (const source of [
    "width: calc(1px + 2%)",
    "width: min(20px, 10%)",
    "max-width: max(2rem, 40vw)",
    "flex: 2 3 clamp(10px, 25%, 200px)",
    "line-height: calc(1.2 * 1em)"
  ]) assert.equal(validate(source).status, "valid", source);

  for (const source of [
    "width: calc(1px + 1deg)",
    "width: calc(2px * 3px)",
    "width: clamp(1px, 2deg, 3px)",
    "width: min()"
  ]) assert.equal(validate(source).status, "invalid", source);
});

test("unsupported grammar evidence is not misreported as invalid CSS", () => {
  const unsupportedMath = validate("width: sin(1px)");
  assert.equal(unsupportedMath.status, "unsupported");
  assert.equal(unsupportedMath.reason, "unresolved-grammar");

  const variable = validate("color: var(--theme)");
  assert.equal(variable.status, "unsupported");
  assert.equal(variable.reason, "arbitrary-substitution");
  assert.equal(validate("color: var(not-a-custom-property)").status, "invalid");

  const proseOnly = validate("-webkit-box-align: start");
  assert.equal(proseOnly.status, "unsupported");
  assert.equal(proseOnly.reason, "missing-property-syntax");

  const unknown = validate("not-a-property: red");
  assert.deepEqual(
    [unknown.status, unknown.reason, unknown.property],
    ["invalid", "unknown-property", null]
  );
});

test("property matching has an explicit deterministic work budget", () => {
  assert.throws(
    () => validate("border: 1px solid red", { maxSteps: 0 }),
    (error) =>
      error instanceof SyntaxResourceError &&
      error.limitName === "maxSteps" &&
      error.actual === 1
  );

  const result = validate("border: 1px solid red");
  assert.equal(result.status, "valid");
  assert.ok(result.usage.steps > 0);
});
