import assert from "node:assert/strict";
import test from "node:test";

import {
  createSelectorMatchSession,
  matchSelectorList,
  parseSelectorList,
  querySelectorList,
  SelectorTreeError,
  SyntaxAbortError,
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

// Work assertions include planning, string scans, candidate copies, and results.
// Construction is separate; these bounds must stay far below a full tree scan.
test("selector match sessions narrow queries through identity indexes", () => {
  const children = Array.from({ length: 10_000 }, (_, index) =>
    element(`item-${String(index)}`, "div", [
      attribute("class", index === 9_999 ? "item needle" : "item")
    ])
  );
  const root = { kind: "other", id: "large-document", children };
  const session = createSelectorMatchSession(root, environment, {
    limits: { maxNodes: 10_001 }
  });
  const before = session.usage();
  const result = session.query(parse(".needle"));
  const after = session.usage();

  assert.deepEqual(result.matches.map((node) => node.id), ["item-9999"]);
  assert.ok(after.steps - before.steps <= 250, {
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
    limits: { maxNodes: 10_003 }
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
  assert.ok(attributeAfter.steps - attributeBefore.steps <= 250, {
    attributeBefore,
    attributeAfter
  });
  assert.ok(rootAfter.steps - attributeAfter.steps <= 250, {
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
    limits: { maxNodes: 10_001 }
  });

  const focusBefore = session.usage();
  const focusResult = session.query(parse(":focus"));
  const focusAfter = session.usage();
  const logicalResult = session.query(parse(":where(.focused, .absent)"));
  const logicalAfter = session.usage();

  assert.deepEqual(focusResult.matches.map((node) => node.id), ["item-9999"]);
  assert.deepEqual(logicalResult.matches.map((node) => node.id), ["item-9999"]);
  assert.ok(focusAfter.steps - focusBefore.steps <= 250, {
    focusBefore,
    focusAfter
  });
  assert.ok(logicalAfter.steps - focusAfter.steps <= 250, {
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
    limits: { maxNodes: 100_001 }
  });
  const before = session.usage();
  const result = session.query(parse("#item-2, #item-50000, #item-99999"));
  const after = session.usage();

  assert.deepEqual(result.matches.map((node) => node.id), [
    "item-2",
    "item-50000",
    "item-99999"
  ]);
  assert.ok(after.steps - before.steps < 500, { before, after });
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
    limits: { maxNodes: 5_003 }
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
  assert.ok(relationAfter.steps - relationBefore.steps <= 250, {
    relationBefore,
    relationAfter
  });
  assert.ok(logicalAfter.steps - relationAfter.steps <= 250, {
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
    limits: { maxNodes: 5_007 }
  });
  const before = session.usage();
  const result = session.query(parse(".rare > section a.target"));
  const after = session.usage();

  assert.deepEqual(result.matches.map((node) => node.id), ["inside-1", "inside-2"]);
  assert.ok(
    after.steps - before.steps <= 250,
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
    limits: { maxNodes: 5_003 }
  });
  const before = session.usage();
  const result = session.match(parse(":has(> .first, *)"), container);
  const after = session.usage();

  assert.equal(result.status, "match");
  assert.ok(after.steps - before.steps <= 250, { before, after });
});


test(":has() traverses relative child, descendant, and sibling chains in tree order", () => {
  const cases = [
    ["section:has(> p + p)", ["section"]],
    ["section:has(p ~ aside)", ["section"]],
    ["section:has(> p + aside)", ["section"]],
    ["section:has(+ div)", ["section"]],
    ["section:has(~ svg > svg|rect[xlink|href])", ["section"]],
    ["section:has(+ div + div)", ["section"]],
    ["p:has(+ p, ~ aside)", ["first", "second"]],
    ["p:has(> aside)", []],
    ["section:has(> svg|rect)", []],
    ["section:has(+ svg)", []],
    ["section:has(> .missing, + div:empty)", ["section"]]
  ];
  for (const [selector, expected] of cases) {
    const result = query(selector);
    assert.deepEqual(result.matches.map((node) => node.id), expected, selector);
    assert.deepEqual(result.unknown, [], selector);
  }
  const withInterveningNodes = element("siblings", "div", [], [
    element("a", "a"), text("gap"), other(), element("b", "b", [], [
      element("c", "c")
    ])
  ]);
  const result = querySelectorList(parse("a:has(+ b > c)"), withInterveningNodes, environment);
  assert.deepEqual(result.matches.map((node) => node.id), ["a"]);
});

test(":has() preserves unknown branches, known alternatives, and namespace decisions", () => {
  const cases = [
    ["section:has(> p:hover)", [], ["section"]],
    ["section:not(:has(> p:hover))", [], ["section"]],
    ["section:has(> p:hover > .missing)", [], []],
    ["section:has(> p:hover, > aside)", ["section"], []],
    ["section:has(+ div:hover)", [], ["section"]],
    ["section:has(~ svg > unknown|rect)", [], ["section"]],
    ["section:has(~ svg > svg|rect)", ["section"], []],
    ["section:has(> unknown|rect > .missing)", [], []]
  ];
  for (const [selector, matches, unknown] of cases) {
    const result = query(selector);
    assert.deepEqual(result.matches.map((node) => node.id), matches, selector);
    assert.deepEqual(result.unknown.map((entry) => entry.node.id), unknown, selector);
    for (const entry of result.unknown) assert.equal(entry.reasons.length, 1);
  }
});

test("relative :has() work is local to anchors rather than the complete document", () => {
  const lists = Array.from({ length: 1_000 }, (_, index) => element(
    `list-${String(index)}`, "ol", [], [
      element(`item-${String(index)}-a`, "li", [], index % 2 === 0
        ? [element(`details-${String(index)}`, "details")]
        : []),
      element(`item-${String(index)}-b`, "li")
    ]
  ));
  const sidebar = element("sidebar", "aside", [attribute("class", "left-sidebar")], lists);
  const root = element("html", "html", [], [sidebar]);
  const session = createSelectorMatchSession(root, environment);
  session.beginEvaluation({ limits: { maxSteps: 200_000 } });
  const result = session.query(parse(":is(.left-sidebar ol):not(:has(> li > details)) > li"));
  assert.equal(result.matches.length, 1_000);
  assert.deepEqual(result.matches.slice(0, 4).map((node) => node.id), [
    "item-1-a", "item-1-b", "item-3-a", "item-3-b"
  ]);
  assert.deepEqual(result.unknown, []);
  assert.ok(result.usage.steps <= 200_000, result.usage);
});

test("relative descendants reuse selective indexes without visiting unrelated nodes", () => {
  const target = element("target", "span", [attribute("class", "needle")]);
  const inside = element("inside", "div", [], [
    ...Array.from({ length: 5_000 }, (_, index) => element(`filler-${String(index)}`, "span")),
    target
  ]);
  const outside = element("outside", "div", [], [
    element("outside-needle", "span", [attribute("class", "needle")])
  ]);
  const root = element("html", "html", [], [inside, outside]);
  const session = createSelectorMatchSession(root, environment);
  session.beginEvaluation({ limits: { maxSteps: 250 } });
  assert.equal(session.match(parse(":has(.needle)"), inside).status, "match");
  assert.ok(session.usage().steps <= 250, session.usage());
});

test("root descendant queries reuse ancestry with linear work on deep trees", () => {
  let child = element("leaf", "span");
  for (let index = 0; index < 5_000; index += 1) {
    child = element(`deep-${String(index)}`, "div", [], [child]);
  }
  const root = element("html", "html", [], [child]);
  const session = createSelectorMatchSession(root, environment);
  session.beginEvaluation({ limits: { maxSteps: 200_000 } });
  const result = session.query(parse(":root *"));
  assert.equal(result.matches.length, 5_001);
  assert.equal(result.matches[0].id, "deep-4999");
  assert.equal(result.matches.at(-1).id, "leaf");
  assert.deepEqual(result.unknown, []);
  assert.ok(result.usage.steps <= 200_000, result.usage);
});

test("ancestor memoization retains unknown state until a known match resolves it", () => {
  const leaf = element("leaf", "span");
  const middle = element("middle", "div", [], [leaf]);
  const root = element("root", "div", [], [middle]);
  const session = createSelectorMatchSession(root, {
    ...environment,
    matchPseudoClass(node) { return node === root ? "match" : "unknown"; }
  });
  const result = session.query(parse(":hover *"));
  assert.deepEqual(result.matches.map((node) => node.id), ["middle", "leaf"]);
  assert.deepEqual(result.unknown, []);
  const unknownSession = createSelectorMatchSession(root, environment);
  const unknownResult = unknownSession.query(parse(":hover *"));
  assert.deepEqual(unknownResult.unknown.map((entry) => entry.node.id), ["middle", "leaf"]);
  assert.ok(unknownResult.unknown.every((entry) => entry.reasons.length === 1));
});

test("evaluation boundaries reset budgets without rebuilding structural indexes", () => {
  let childReads = 0;
  let hovered = first;
  const session = createSelectorMatchSession(document, {
    ...environment,
    tree: {
      ...environment.tree,
      children(node) { childReads += 1; return node.children; }
    },
    pseudoClassCandidates(pseudo) { return pseudo.name === "hover" ? [hovered] : null; },
    matchPseudoClass(node) { return node === hovered ? "match" : "no-match"; }
  });
  const indexedChildReads = childReads;
  const selector = parse("p:hover");
  for (let index = 0; index < 100; index += 1) {
    hovered = index % 2 === 0 ? first : second;
    session.beginEvaluation({ limits: { maxSteps: 100 } });
    assert.equal(session.usage().steps, 0);
    assert.equal(session.usage().nodes, 0);
    assert.deepEqual(session.query(selector).matches, [hovered]);
    // Multiple operations share one budget until the next explicit boundary.
    assert.throws(() => {
      for (let queryIndex = 0; queryIndex < 20; queryIndex += 1) session.query(selector);
    }, (error) => error instanceof SyntaxResourceError && error.limitName === "maxSteps");
  }
  session.beginEvaluation();
  assert.deepEqual(session.query(selector).matches, [hovered]);
  assert.equal(childReads, indexedChildReads);
});

test("memoization does not retain dynamic or stylesheet namespace state between operations", () => {
  let hovered = first;
  let namespace = HTML;
  const session = createSelectorMatchSession(document, {
    ...environment,
    get defaultNamespace() { return { kind: "namespace", namespace }; },
    resolveNamespacePrefix() { return { status: "resolved", namespace }; },
    pseudoClassCandidates(pseudo) { return pseudo.name === "hover" ? [hovered] : null; },
    matchPseudoClass(node) { return node === hovered ? "match" : "no-match"; }
  });
  const relative = parse("section:has(> p:hover)");
  const direct = parse("p:hover");
  assert.deepEqual(session.query(relative).matches, [section]);
  assert.deepEqual(session.query(direct).matches, [first]);
  hovered = second;
  assert.deepEqual(session.query(direct).matches, [second]);
  hovered = aside;
  assert.deepEqual(session.query(relative).matches, []);
  const prefixed = parse("sheet|rect");
  const implicit = parse("rect");
  assert.deepEqual(session.query(prefixed).matches, []);
  namespace = SVG;
  assert.deepEqual(session.query(prefixed).matches.map((node) => node.id), ["rect"]);
  assert.deepEqual(session.query(implicit).matches.map((node) => node.id), ["rect"]);
  namespace = HTML;
  assert.deepEqual(session.query(implicit).matches, []);
});

test("evaluation cancellation can be replaced and aborted operations remain observable", () => {
  const firstController = new AbortController();
  const session = createSelectorMatchSession(document, environment, { signal: firstController.signal });
  firstController.abort("old evaluation");
  assert.throws(() => session.query(parse(".absent")), SyntaxAbortError);
  const activeController = new AbortController();
  session.beginEvaluation({ signal: activeController.signal, limits: { maxSteps: 100 } });
  assert.deepEqual(session.query(parse(".featured")).matches, [second]);
  const before = session.usage();
  assert.throws(() => session.beginEvaluation({ limits: { maxSteps: -1 } }), RangeError);
  assert.throws(() => session.beginEvaluation({ signal: firstController.signal }), SyntaxAbortError);
  assert.deepEqual(session.usage(), before);
  activeController.abort("current evaluation");
  assert.throws(() => session.match(parse("*"), other()), (error) =>
    error instanceof SyntaxAbortError && error.reason === "current evaluation"
  );
  session.beginEvaluation();
  assert.deepEqual(session.query(parse(".featured")).matches, [second]);
});

test("relative traversal honors cancellation during matching", () => {
  const controller = new AbortController();
  const session = createSelectorMatchSession(document, {
    ...environment,
    matchPseudoClass() { controller.abort("relative cancelled"); return "no-match"; }
  });
  session.beginEvaluation({ signal: controller.signal });
  assert.throws(() => session.match(parse(":has(> p:hover)"), section), (error) =>
    error instanceof SyntaxAbortError && error.reason === "relative cancelled"
  );
});

test("relative matching preserves all source-located unknown reasons", () => {
  const definite = element("definite", "span");
  const uncertain = element("uncertain", "span");
  const branch = element("branch", "div", [], [definite, uncertain]);
  const root = element("root", "section", [], [branch]);
  const selector = parse("section:has(div:hover span:hover)");
  const session = createSelectorMatchSession(root, {
    ...environment,
    matchPseudoClass(node) { return node === definite ? "match" : "unknown"; }
  });
  const result = session.query(selector);
  assert.deepEqual(result.matches, []);
  assert.equal(result.unknown.length, 1);
  assert.deepEqual(result.unknown[0].reasons.map((reason) => ({
    name: reason.name, offset: reason.span.start.offset
  })), [
    { name: "hover", offset: 15 }, { name: "hover", offset: 26 }
  ]);
});

test("relative sibling queries use local indexed relationships", () => {
  const children = Array.from({ length: 5_000 }, (_, index) => element(
    `sibling-${String(index)}`, "span", [attribute("class", index % 2 === 0 ? "anchor" : "target")]
  ));
  const root = element("root", "div", [], children);
  const session = createSelectorMatchSession(root, environment);
  for (const combinator of ["+", "~"]) {
    session.beginEvaluation({ limits: { maxSteps: 200_000 } });
    const result = session.query(parse(`.anchor:has(${combinator} .target)`));
    assert.equal(result.matches.length, 2_500);
    assert.equal(result.matches[0].id, "sibling-0");
    assert.equal(result.matches.at(-1).id, "sibling-4998");
    assert.deepEqual(result.unknown, []);
    assert.ok(result.usage.steps <= 200_000, result.usage);
  }
});

test("evaluation boundaries retain explicit scope and nesting options", () => {
  const session = createSelectorMatchSession(document, environment, {
    scopes: new Set([section]), nesting: parse(".card")
  });
  for (let index = 0; index < 3; index += 1) {
    session.beginEvaluation({ limits: { maxSteps: 500 } });
    assert.deepEqual(session.query(parse(":scope > p")).matches, [first, second]);
    assert.deepEqual(session.query(parse("& > p")).matches, [first, second]);
  }
});

test("cancellation is checked even when the final pseudo callback returns a match", () => {
  const controller = new AbortController();
  const session = createSelectorMatchSession(document, {
    ...environment,
    matchPseudoClass() { controller.abort("last callback"); return "match"; }
  });
  session.beginEvaluation({ signal: controller.signal });
  assert.throws(() => session.match(parse(":hover"), first), (error) =>
    error instanceof SyntaxAbortError && error.reason === "last callback"
  );
});

test("valid unknown WebKit pseudo-elements match nothing without poisoning siblings", () => {
  const parsed = parseSelectorList("p::-WebKit-future, #content");
  assert.equal(parsed.ok, true);
  const result = querySelectorList(parsed.value, document, environment);
  assert.deepEqual(result.matches.map((node) => node.id), ["section"]);
  assert.deepEqual(result.unknown, []);
});
