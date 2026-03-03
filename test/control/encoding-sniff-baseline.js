import test from "node:test";
import assert from "node:assert/strict";

import { sniffCssEncoding } from "../../dist/internal/encoding/mod.js";

function bytesFromText(text) {
  return new TextEncoder().encode(text);
}

test("baseline: sniffCssEncoding prioritizes BOM over transport and @charset", () => {
  const content = bytesFromText('@charset "windows-1252"; .x { color: red; }');
  const bytes = new Uint8Array(3 + content.length);
  bytes.set([0xef, 0xbb, 0xbf], 0);
  bytes.set(content, 3);

  const result = sniffCssEncoding(bytes, { transportEncodingLabel: "iso-8859-1" });
  assert.equal(result.encoding, "utf-8");
  assert.equal(result.source, "bom");
});
