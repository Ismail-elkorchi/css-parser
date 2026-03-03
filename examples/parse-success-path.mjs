/**
 * Demonstrates deterministic stylesheet parsing and serialization.
 * Run: npm run build && node examples/parse-success-path.mjs
 */
import { parse, serialize } from "../dist/mod.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function runParseSuccessPath() {
  const css = ".card { color: red; margin: 1px; }";
  const tree = parse(css, { captureSpans: true });
  assert(tree.kind === "stylesheet", "parse should return a stylesheet tree");

  const serialized = serialize(tree);
  assert(serialized.includes(".card"), "serialize should preserve selector text");
  assert(serialized.includes("color"), "serialize should include declaration output");
  return serialized;
}

if (import.meta.main) {
  runParseSuccessPath();
  console.log("parse-success-path ok");
}
