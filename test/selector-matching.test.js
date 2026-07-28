import assert from "node:assert/strict";
import test from "node:test";

import {
  matchSelectorList,
  querySelectorList,
  SelectorTreeError
} from "../dist/internal/selectors/matcher.js";
import { parseSelectorList } from "../dist/internal/selectors/parser.js";
import { SyntaxResourceError } from "../dist/internal/syntax/resources.js";

const HTML = "http://www.w3.org/1999/xhtml";
const SVG = "http://www.w3.org/2000/svg";
const XLINK = "http://www.w3.org/1999/xlink";

function element(id, localName, attributes = [], children = [], namespace = HTML) {
  return { kind: "element", id, namespace, localName, attributes, children };
}

function text(value) {
  return { kind: "text", value, children: [] };
}

function other() {
  return { kind: "other", children: [] };
}

function attribute(localName, value, namespace = null) {
  return { namespace, localName, value };
}

const first = element("first", "P", [
  attribute("class", "item"),
  attribute("data-kind", "A")
], [text("first")]);
const second = element("second", "p", [
  attribute("CLASS", "item featured"),
  attribute("data-kind", "b")
]);
const aside = element("aside", "aside", [attribute("hidden", "")]);
const section = element("section", "section", [
  attribute("id", "content"),
  attribute("class", "card")
], [first, second, aside]);
const empty = element("empty", "div", [], [other()]);
const whitespace = element("whitespace", "div", [], [text(" ")]);
const svg = element("svg", "svg", [], [
  element("rect", "rect", [attribute("href", "#paint", XLINK)], [], SVG)
], SVG);
const html = element("html", "html", [], [
  element("body", "body", [], [section, empty, whitespace, svg])
]);
const document = { kind: "other", id: "document", children: [html] };

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
      if (node.kind === "text") return { kind: "text", value: node.value };
      return { kind: "other" };
    },
    children(node) {
      return node.children;
    }
  },
  documentMode: { syntax: "html", quirks: "no-quirks" },
  defaultNamespace: { kind: "any" },
  idValues(_node, data) {
    return data.attributes
      .filter(
        (entry) =>
          entry.namespace === null &&
          entry.localName.toLowerCase() === "id"
      )
      .map((entry) => entry.value);
  },
  classNames(_node, data) {
    return data.attributes
      .filter(
        (entry) =>
          entry.namespace === null &&
          entry.localName.toLowerCase() === "class"
      )
      .flatMap((entry) => entry.value.split(/\s+/u).filter(Boolean));
  },
  resolveNamespacePrefix(prefix) {
    if (prefix === "svg") return { status: "resolved", namespace: SVG };
    if (prefix === "xlink") return { status: "resolved", namespace: XLINK };
    return { status: "unknown" };
  },
  attributeValueCaseSensitivity(_element, attr) {
    return attr.localName === "data-kind"
      ? "ascii-insensitive"
      : "sensitive";
  },
  matchPseudoClass(node, pseudo) {
    if (pseudo.name === "disabled") {
      return node.attributes?.some((entry) => entry.localName === "disabled")
        ? "match"
        : "no-match";
    }
    return "unknown";
  }
};

function parse(source) {
  const result = parseSelectorList(source);
  assert.equal(result.ok, true, `${source}: ${JSON.stringify(result.errors)}`);
  if (!result.ok) throw new Error(`Unable to parse ${source}`);
  return result.value;
}

function query(source, options) {
  return querySelectorList(parse(source), document, environment, options);
}

test("matching covers relationships, logical pseudos, has, and indexed filters", () => {
  const cases = [
    ["section > p + p", ["second"]],
    ["p ~ aside", ["aside"]],
    ["section:has(> p.featured)", ["section"]],
    ["p:nth-child(2 of .item)", ["second"]],
    ["p:nth-of-type(2)", ["second"]],
    ["section > :not([hidden])", ["first", "second"]],
    [":is(#content, .missing)", ["section"]],
    [":where(.card)", ["section"]]
  ];
  for (const [selector, expected] of cases) {
    const result = query(selector);
    assert.deepEqual(result.matches.map((node) => node.id), expected, selector);
    assert.deepEqual(result.unknown, [], selector);
  }
});

test("HTML names, attribute modifiers, and environment default casing are exact", () => {
  assert.deepEqual(query("SECTION > P").matches.map((node) => node.id), [
    "first",
    "second"
  ]);
  assert.deepEqual(query("[class~=\"featured\"]").matches.map((node) => node.id), [
    "second"
  ]);
  assert.deepEqual(query("[data-kind=\"a\"]").matches.map((node) => node.id), [
    "first"
  ]);
  assert.deepEqual(query("[data-kind=\"A\" s]").matches.map((node) => node.id), [
    "first"
  ]);
  assert.deepEqual(query("[data-kind^=\"\"]").matches, []);
});

test("empty, root, and explicit scope use tree structure rather than heuristics", () => {
  assert.deepEqual(query("div:empty").matches.map((node) => node.id), ["empty"]);
  assert.deepEqual(query(":root").matches.map((node) => node.id), ["html"]);
  const scoped = querySelectorList(
    parse(":scope > p"),
    document,
    environment,
    { scopes: new Set([section]) }
  );
  assert.deepEqual(scoped.matches.map((node) => node.id), ["first", "second"]);
});

test("namespace prefixes, wildcard attributes, and defaults are explicit", () => {
  assert.equal(
    matchSelectorList(
      parse("svg|rect[xlink|href]"),
      svg.children[0],
      document,
      environment
    ).status,
    "match"
  );
  assert.equal(
    matchSelectorList(
      parse("[*|href]"),
      svg.children[0],
      document,
      environment
    ).status,
    "match"
  );
  const unresolved = matchSelectorList(
    parse("unknown|rect"),
    svg.children[0],
    document,
    environment
  );
  assert.equal(unresolved.status, "unknown");
  assert.equal(unresolved.reasons[0].code, "namespace-prefix");

  const svgDefault = {
    ...environment,
    defaultNamespace: { kind: "namespace", namespace: SVG }
  };
  assert.equal(
    matchSelectorList(
      parse("rect"),
      svg.children[0],
      document,
      svgDefault
    ).status,
    "match"
  );
});

test("unknown pseudo state is distinct from a definite non-match", () => {
  const result = query("p:hover");
  assert.deepEqual(result.matches, []);
  assert.deepEqual(result.unknown.map((entry) => entry.node.id), [
    "first",
    "second"
  ]);
  assert.ok(
    result.unknown.every(
      (entry) =>
        entry.reasons.length === 1 &&
        entry.reasons[0].code === "pseudo-class"
    )
  );
});

test("quirks mode changes only class and ID identity matching", () => {
  const quirksEnvironment = {
    ...environment,
    documentMode: { syntax: "html", quirks: "quirks" }
  };
  assert.equal(
    matchSelectorList(
      parse(".ITEM"),
      first,
      document,
      quirksEnvironment
    ).status,
    "match"
  );
  assert.equal(
    matchSelectorList(
      parse("#CONTENT"),
      section,
      document,
      quirksEnvironment
    ).status,
    "match"
  );
  assert.equal(
    matchSelectorList(parse(".ITEM"), first, document, environment).status,
    "no-match"
  );
});

test("XML matching retains case and namespace sensitivity", () => {
  const xmlEnvironment = {
    ...environment,
    documentMode: { syntax: "xml" },
    defaultNamespace: { kind: "namespace", namespace: HTML }
  };
  assert.equal(
    matchSelectorList(parse("P"), first, document, xmlEnvironment).status,
    "match"
  );
  assert.equal(
    matchSelectorList(parse("p"), first, document, xmlEnvironment).status,
    "no-match"
  );
});

test("matching rejects non-tree graphs and enforces resource limits", () => {
  const cyclic = { kind: "other", children: [] };
  cyclic.children.push(cyclic);
  assert.throws(
    () => querySelectorList(parse("*"), cyclic, environment),
    (error) =>
      error instanceof SelectorTreeError &&
      error.reason === "cycle"
  );
  assert.throws(
    () => query("*", { limits: { maxNodes: 2 } }),
    (error) =>
      error instanceof SyntaxResourceError &&
      error.limitName === "maxNodes"
  );
});
