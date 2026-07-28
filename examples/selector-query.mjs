/** Parses and applies a selector to an application-owned tree. */
import { parseSelectorList, querySelectorList } from "../dist/mod.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function runSelectorQuery() {
  const selector = parseSelectorList("#content .card");
  assert(selector.ok, "selector should parse");
  if (!selector.ok) return 0;
  const root = {
    kind: "other",
    children: [
      {
        kind: "element",
        namespace: "http://www.w3.org/1999/xhtml",
        localName: "main",
        attributes: [{ namespace: null, localName: "id", value: "content" }],
        children: [
          {
            kind: "element",
            namespace: "http://www.w3.org/1999/xhtml",
            localName: "section",
            attributes: [{ namespace: null, localName: "class", value: "card" }],
            children: []
          }
        ]
      }
    ]
  };

  const environment = {
    tree: {
      data(node) {
        if (node.kind === "element") {
          return {
            kind: "element",
            namespace: node.namespace,
            localName: node.localName,
            attributes: node.attributes
          };
        }
        return { kind: "other" };
      },
      children(node) {
        return node.children;
      }
    },
    documentMode: { syntax: "html", quirks: "no-quirks" },
    defaultNamespace: { kind: "any" },
    idValues(_node, element) {
      return element.attributes
        .filter((attribute) => attribute.localName === "id")
        .map((attribute) => attribute.value);
    },
    classNames(_node, element) {
      return element.attributes
        .filter((attribute) => attribute.localName === "class")
        .flatMap((attribute) => attribute.value.split(/\s+/u));
    },
    resolveNamespacePrefix() {
      return { status: "unknown" };
    },
    attributeValueCaseSensitivity() {
      return "sensitive";
    },
    matchPseudoClass() {
      return "unknown";
    }
  };

  const result = querySelectorList(selector.value, root, environment);
  assert(result.matches.length === 1, "selector should match exactly one node");
  return result.matches.length;
}

if (import.meta.main) {
  runSelectorQuery();
  console.log("selector-query ok");
}
