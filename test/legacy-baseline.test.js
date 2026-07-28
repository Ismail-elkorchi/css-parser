import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { sha256, verifyLegacyRuntime } from "./support/legacy-baseline.mjs";

import { parse, parseFragment, serialize, tokenize } from "../dist/mod.js";

const CASES = [
  {
    id: "stylesheet",
    run: () => parse(
      "@layer base;@media (width >= 40rem){article:is(.card,#lead)>h2[data-level=\"1\" i]{color:color(display-p3 1 0 0/.8);--gap:calc(1rem + 2px)}}",
      { captureSpans: true }
    )
  },
  {
    id: "malformed",
    run: () => parse("@supports (display:grid { .a{display:grid} }", { captureSpans: true })
  },
  {
    id: "declaration-list",
    run: () => parseFragment(
      "color:red;--token: calc(1px + 2%);display:none!important",
      "declarationList",
      { captureSpans: true }
    )
  },
  {
    id: "selector-list",
    run: () => parseFragment(
      "svg|a[href^=\"https\" i]:not(.disabled), :has(> img)",
      "selectorList",
      { captureSpans: true }
    )
  },
  {
    id: "value",
    run: () => parseFragment(
      "linear-gradient(45deg, rgb(1 2 3 / .5), var(--stop))",
      "value",
      { captureSpans: true }
    )
  },
  {
    id: "tokens",
    run: () => tokenize(String.raw`.\\66 oo#id{width:+.5e2px;unicode-range:U+00A0-00FF}`)
  }
];

test("legacy runtime files match their exact provenance manifest", async () => {
  assert.deepEqual(await verifyLegacyRuntime(), []);
});

test("legacy runtime integrity detects a controlled mutation", async () => {
  let mutated = false;
  const failures = await verifyLegacyRuntime(async (url) => {
    const bytes = await readFile(url);
    if (!mutated && url.pathname.endsWith("csstree.esm.js")) {
      mutated = true;
      const copy = Buffer.from(bytes);
      copy[0] ^= 1;
      return copy;
    }
    return bytes;
  });

  assert.equal(failures.length, 1);
  assert.equal(failures[0].path, "src/internal/vendor/csstree/csstree.esm.js");
});

test("legacy public behavior remains frozen during independent engine work", async () => {
  const baseline = JSON.parse(
    await readFile(new URL("./fixtures/legacy/behavior.json", import.meta.url), "utf8")
  );

  for (const fixture of baseline.cases) {
    const definition = CASES.find((entry) => entry.id === fixture.id);
    assert.ok(definition, `missing legacy case ${fixture.id}`);
    const value = definition.run();
    const json = JSON.stringify(value);
    assert.equal(Buffer.byteLength(json), fixture.bytes, fixture.id);
    assert.equal(sha256(json), fixture.sha256, fixture.id);
    if (fixture.serialized !== undefined) {
      assert.equal(serialize(value), fixture.serialized, fixture.id);
    }
  }
});
