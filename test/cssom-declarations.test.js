import assert from "node:assert/strict";
import test from "node:test";

import { CssDeclarationBlock } from "../dist/mod.js";

test("declaration blocks discard invalid declarations and resolve duplicates", () => {
  const block = CssDeclarationBlock.parse(
    "color: red; width: 1px; COLOR: blue; unknown: value"
  );
  assert.equal(block.cssText, "color: blue; width: 1px;");
  assert.deepEqual(
    block.declarations.map(({ name, value }) => [name, value]),
    [["color", "blue"], ["width", "1px"]]
  );
});

test("important declarations are not overridden by lower-priority duplicates", () => {
  const block = CssDeclarationBlock.parse(
    "color: red !important; color: blue; COLOR: green !important"
  );
  assert.equal(block.cssText, "color: green !important;");
  assert.equal(block.getPropertyPriority("CoLoR"), "important");
});

test("legacy aliases use their canonical CSSOM identity", () => {
  const block = CssDeclarationBlock.parse(
    "-webkit-align-content: center; align-content: start"
  );
  assert.equal(block.length, 1);
  assert.equal(block.item(0), "align-content");
  assert.equal(block.getPropertyValue("-WEBKIT-ALIGN-CONTENT"), "start");
});

test("custom-property identity remains case-sensitive and preserves value text", () => {
  const block = CssDeclarationBlock.parse(
    "--Theme: Foo  BAR; --theme: baz; --Theme: qux"
  );
  assert.equal(block.cssText, "--Theme: qux; --theme: baz;");
  assert.equal(block.getPropertyValue("--Theme"), "qux");
  assert.equal(block.getPropertyValue("--theme"), "baz");
});

test("value serialization follows CSSOM component spacing", () => {
  const block = CssDeclarationBlock.parse(
    "background: url(a), RED; font: italic 12px/2 Arial"
  );
  assert.equal(block.getPropertyValue("background"), "url(a), RED");
  assert.equal(block.getPropertyValue("font"), "italic 12px / 2 Arial");
});

test("mutation validates priority, names, and values before changing state", () => {
  const block = CssDeclarationBlock.parse("color: red");

  assert.deepEqual(block.setProperty("color", "blue", "urgent"), {
    status: "ignored",
    reason: "invalid-priority"
  });
  assert.deepEqual(block.setProperty("unknown", "blue"), {
    status: "ignored",
    reason: "unknown-property"
  });
  assert.deepEqual(block.setProperty("color", "1px"), {
    status: "ignored",
    reason: "invalid-value"
  });
  assert.equal(block.cssText, "color: red;");

  assert.deepEqual(block.setProperty("COLOR", "blue", "IMPORTANT"), {
    status: "set",
    declaration: {
      name: "color",
      value: "blue",
      important: true
    },
    previousValue: "red"
  });
  assert.equal(block.cssText, "color: blue !important;");
});

test("empty mutation values remove declarations", () => {
  const block = CssDeclarationBlock.parse("width: 1px; color: red");
  assert.deepEqual(block.setProperty("WIDTH", ""), {
    status: "removed",
    previousValue: "1px"
  });
  assert.equal(block.removeProperty("color"), "red");
  assert.equal(block.cssText, "");
});

test("valid values outside the current grammar resolver are retained", () => {
  const block = CssDeclarationBlock.parse(
    "width: calc(1px + 2%); color: var(--Theme)"
  );
  assert.equal(block.length, 2);
  assert.equal(block.getPropertyValue("width"), "calc(1px + 2%)");
  assert.equal(block.getPropertyValue("color"), "var(--Theme)");
});
