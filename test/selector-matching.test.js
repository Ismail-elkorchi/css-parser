import assert from "node:assert/strict";
import test from "node:test";

import {
  createSelectorMatchSession,
  matchSelectorList,
  parseSelectorList,
  querySelectorList,
  SelectorTreeError,
  SyntaxResourceError
} from "../dist/mod.js";

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

test("selector match sessions reuse one structural index", () => {
  let childReads = 0;
  const countingEnvironment = {
    ...environment,
    tree: {
      ...environment.tree,
      children(node) {
        childReads += 1;
        return environment.tree.children(node);
      }
    }
  };
  const session = createSelectorMatchSession(
    document,
    countingEnvironment
  );
  const indexedChildReads = childReads;

  assert.deepEqual(
    session.query(parse("section > .item")).matches.map((node) => node.id),
    ["first", "second"]
  );
  assert.equal(session.match(parse("#content"), section).status, "match");
  assert.deepEqual(
    session.query(parse("svg|rect[xlink|href]")).matches.map((node) => node.id),
    ["rect"]
  );
  assert.equal(childReads, indexedChildReads);
  assert.ok(session.usage().steps > 0);
});

test("selector match sessions narrow queries through identity indexes", () => {
  const children = Array.from({ length: 10_000 }, (_, index) =>
    element(`item-${String(index)}`, "div", [
      attribute("class", index === 9_999 ? "item needle" : "item")
    ])
  );
  const root = { kind: "other", id: "large-document", children };
  const session = createSelectorMatchSession(root, environment, {
    limits: { maxNodes: 10_001, maxSteps: 50_000 }
  });
  const before = session.usage();
  const result = session.query(parse(".needle"));
  const after = session.usage();

  assert.deepEqual(result.matches.map((node) => node.id), ["item-9999"]);
  assert.ok(after.steps - before.steps <= 4, {
    before,
    after
  });
});

test("selector match sessions narrow attribute and root queries", () => {
  const children = Array.from({ length: 10_000 }, (_, index) =>
    element(
      `item-${String(index)}`,
      "div",
      index === 9_999 ? [attribute("data-needle", "yes")] : []
    )
  );
  const body = element("large-body", "body", [], children);
  const documentElement = element("large-html", "html", [], [body]);
  const root = { kind: "other", id: "large-document", children: [documentElement] };
  const session = createSelectorMatchSession(root, environment, {
    limits: { maxNodes: 10_003, maxSteps: 50_000 }
  });

  const attributeBefore = session.usage();
  const attributeResult = session.query(parse("[data-needle]"));
  const attributeAfter = session.usage();
  const rootResult = session.query(parse(":root"));
  const rootAfter = session.usage();

  assert.deepEqual(
    attributeResult.matches.map((node) => node.id),
    ["item-9999"]
  );
  assert.deepEqual(rootResult.matches.map((node) => node.id), ["large-html"]);
  assert.ok(attributeAfter.steps - attributeBefore.steps <= 5, {
    attributeBefore,
    attributeAfter
  });
  assert.ok(rootAfter.steps - attributeAfter.steps <= 5, {
    attributeAfter,
    rootAfter
  });
});

test("selector sessions narrow logical and environment-owned pseudo classes", () => {
  const children = Array.from({ length: 10_000 }, (_, index) =>
    element(
      `item-${String(index)}`,
      "a",
      index === 9_999 ? [attribute("class", "focused")] : []
    )
  );
  const focused = children.at(-1);
  assert.ok(focused !== undefined);
  const root = { kind: "other", id: "pseudo-document", children };
  const pseudoEnvironment = {
    ...environment,
    pseudoClassCandidates(pseudo) {
      return pseudo.name === "focus" ? [focused, element("outside", "a")] : null;
    },
    matchPseudoClass(node, pseudo) {
      return pseudo.name === "focus" && node === focused ? "match" : "no-match";
    }
  };
  const session = createSelectorMatchSession(root, pseudoEnvironment, {
    limits: { maxNodes: 10_001, maxSteps: 50_000 }
  });

  const focusBefore = session.usage();
  const focusResult = session.query(parse(":focus"));
  const focusAfter = session.usage();
  const logicalResult = session.query(parse(":where(.focused, .absent)"));
  const logicalAfter = session.usage();

  assert.deepEqual(focusResult.matches.map((node) => node.id), ["item-9999"]);
  assert.deepEqual(logicalResult.matches.map((node) => node.id), ["item-9999"]);
  assert.ok(focusAfter.steps - focusBefore.steps <= 10, {
    focusBefore,
    focusAfter
  });
  assert.ok(logicalAfter.steps - focusAfter.steps <= 15, {
    focusAfter,
    logicalAfter
  });
});

test("ordered candidate joins preserve HTML, foreign-content, and pseudo order", () => {
  const htmlUpper = element("html-upper", "P", [attribute("DATA-KIND", "html")]);
  const svgExact = element("svg-exact", "P", [attribute("DATA-KIND", "svg")], [], SVG);
  const htmlLower = element("html-lower", "p", [attribute("data-kind", "html")]);
  const root = { kind: "other", id: "ordered-document", children: [
    htmlUpper,
    svgExact,
    htmlLower
  ] };
  const reversed = [htmlLower, svgExact, htmlUpper, htmlLower];
  const orderedEnvironment = {
    ...environment,
    pseudoClassCandidates(pseudo) {
      return pseudo.name === "focus" ? reversed : null;
    },
    matchPseudoClass(node, pseudo) {
      return pseudo.name === "focus" && reversed.includes(node)
        ? "match"
        : "no-match";
    }
  };
  const session = createSelectorMatchSession(root, orderedEnvironment);

  assert.deepEqual(
    session.query(parse("P")).matches.map((node) => node.id),
    ["html-upper", "svg-exact", "html-lower"]
  );
  assert.deepEqual(
    session.query(parse("[*|DATA-KIND]")).matches.map((node) => node.id),
    ["html-upper", "svg-exact", "html-lower"]
  );
  assert.deepEqual(
    session.query(parse(":is(#html-lower, P, #html-upper)")).matches.map((node) => node.id),
    ["html-upper", "svg-exact", "html-lower"]
  );
  assert.deepEqual(
    session.query(parse(":focus")).matches.map((node) => node.id),
    ["html-upper", "svg-exact", "html-lower"]
  );
});

test("small ordered unions do not scan a large document", () => {
  const children = Array.from({ length: 100_000 }, (_, index) =>
    element(`item-${String(index)}`, index % 7 === 0 ? "span" : "div", [
      attribute("id", `item-${String(index)}`)
    ])
  );
  const root = { kind: "other", id: "union-document", children };
  const session = createSelectorMatchSession(root, environment, {
    limits: { maxNodes: 100_001, maxSteps: 500_000 }
  });
  const before = session.usage();
  const result = session.query(parse("#item-2, #item-50000, #item-99999"));
  const after = session.usage();

  assert.deepEqual(result.matches.map((node) => node.id), [
    "item-2",
    "item-50000",
    "item-99999"
  ]);
  assert.ok(after.steps - before.steps < 100, { before, after });
});

test("selector matching short-circuits relation and logical alternatives", () => {
  let child = element("needle", "span", [attribute("class", "needle")]);
  for (let index = 0; index < 5_000; index += 1) {
    child = element(
      `ancestor-${String(index)}`,
      "div",
      [attribute("class", "ancestor")],
      [child]
    );
  }
  const documentElement = element("deep-html", "html", [], [child]);
  const root = { kind: "other", id: "deep-document", children: [documentElement] };
  const session = createSelectorMatchSession(root, environment, {
    limits: { maxNodes: 5_003, maxSteps: 40_000 }
  });

  const relationBefore = session.usage();
  const relationResult = session.query(parse(".ancestor .needle"));
  const relationAfter = session.usage();
  const needle = relationResult.matches[0];
  assert.ok(needle !== undefined);
  const logicalResult = session.match(parse(":is(.needle, :has(*))"), needle);
  const logicalAfter = session.usage();

  assert.deepEqual(relationResult.matches.map((node) => node.id), ["needle"]);
  assert.equal(logicalResult.status, "match");
  assert.ok(relationAfter.steps - relationBefore.steps <= 8, {
    relationBefore,
    relationAfter
  });
  assert.ok(logicalAfter.steps - relationAfter.steps <= 5, {
    relationAfter,
    logicalAfter
  });
});

test("selector queries propagate selective left compounds toward the subject", () => {
  const matching = [
    element("inside-1", "a", [attribute("class", "target")]),
    element("inside-2", "a", [attribute("class", "target")])
  ];
  const rare = element("rare", "div", [attribute("class", "rare")], [
    element("rare-section", "section", [], matching)
  ]);
  const outside = Array.from({ length: 5_000 }, (_, index) =>
    element(`outside-${String(index)}`, "a", [attribute("class", "target")])
  );
  const documentElement = element("selective-html", "html", [], [
    element("selective-body", "body", [], [rare, ...outside])
  ]);
  const root = {
    kind: "other",
    id: "selective-document",
    children: [documentElement]
  };
  const session = createSelectorMatchSession(root, environment, {
    limits: { maxNodes: 5_007, maxSteps: 40_000 }
  });
  const before = session.usage();
  const result = session.query(parse(".rare > section a.target"));
  const after = session.usage();

  assert.deepEqual(result.matches.map((node) => node.id), ["inside-1", "inside-2"]);
  assert.ok(
    after.steps - before.steps <= 25,
    JSON.stringify({ before, after })
  );
});

test(":has() short-circuits after the first matching relative selector", () => {
  const first = element("first-match", "span", [attribute("class", "first")]);
  const children = [
    first,
    ...Array.from({ length: 5_000 }, (_, index) =>
      element(`other-${String(index)}`, "span")
    )
  ];
  const container = element("container", "div", [], children);
  const root = { kind: "other", id: "has-document", children: [container] };
  const session = createSelectorMatchSession(root, environment, {
    limits: { maxNodes: 5_003, maxSteps: 30_000 }
  });
  const before = session.usage();
  const result = session.match(parse(":has(> .first, *)"), container);
  const after = session.usage();

  assert.equal(result.status, "match");
  assert.ok(after.steps - before.steps <= 8, { before, after });
});
