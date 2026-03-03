/**
 * Demonstrates selector compilation and deterministic node matching.
 * Run: npm run build && node examples/selector-query.mjs
 */
import { compileSelectorList, querySelectorAll } from "../dist/mod.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function runSelectorQuery() {
  const selector = compileSelectorList("#content .card");
  const root = {
    kind: "document",
    children: [
      {
        kind: "element",
        tagName: "main",
        attributes: [{ name: "id", value: "content" }],
        children: [
          {
            kind: "element",
            tagName: "section",
            attributes: [{ name: "class", value: "card" }],
            children: []
          }
        ]
      }
    ]
  };

  const nodes = querySelectorAll(selector, root);
  assert(nodes.length === 1, "selector should match exactly one node");
  return nodes.length;
}

if (import.meta.main) {
  runSelectorQuery();
  console.log("selector-query ok");
}
