/**
 * What it does: compiles a selector list and queries a deterministic node tree.
 * Expected output: prints "selector-query ok" and confirms exactly one match.
 * Constraints: sample tree must include matching id/class attributes for the selector.
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
