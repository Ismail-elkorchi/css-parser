/** Parses and serializes a stylesheet. */
import { parseStylesheet, serialize } from "../dist/mod.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function runParseSuccessPath() {
  const css = ".card { color: red; margin: 1px; }";
  const result = parseStylesheet(css);
  assert(result.ok, "stylesheet should parse");
  if (!result.ok) return "";
  assert(result.value.kind === "stylesheet", "parse should return a stylesheet");

  const serialized = serialize(result.value);
  assert(serialized.includes(".card"), "serialize should preserve selector text");
  assert(serialized.includes("color"), "serialize should include declaration output");
  return serialized;
}

if (import.meta.main) {
  runParseSuccessPath();
  console.log("parse-success-path ok");
}
