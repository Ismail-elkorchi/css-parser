import {
  compileSelectorList,
  parse,
  parseBytes,
  querySelectorAll,
  serialize
} from "../dist/mod.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runParseScenario() {
  const tree = parse(".card { color: red; margin: 1px; }");
  const css = serialize(tree);
  assert(css.includes(".card"), "serialized CSS should include selector");
}

function runParseBytesScenario() {
  const bytes = new TextEncoder().encode(".title { font-weight: 700; }");
  const tree = parseBytes(bytes, {
    budgets: {
      maxInputBytes: 2048,
      maxNodes: 256
    }
  });
  const css = serialize(tree);
  assert(css.includes("font-weight"), "parseBytes should parse stylesheet bytes");
}

function runSelectorScenario() {
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
}

runParseScenario();
runParseBytesScenario();
runSelectorScenario();

console.log("examples:run ok");
