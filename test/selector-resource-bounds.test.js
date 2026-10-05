import assert from "node:assert/strict";
import test from "node:test";
import { createSelectorMatchSession, parseSelectorList, SyntaxAbortError, SyntaxResourceError } from "../dist/mod.js";

const HTML = "http://www.w3.org/1999/xhtml";
const SVG = "http://www.w3.org/2000/svg";
const element = (id, localName = "p", namespace = HTML, children = [], attributes = []) => ({ kind: "element", id, localName, namespace, children, attributes });
const other = (children = []) => ({ kind: "other", children });
const text = (value) => ({ kind: "text", value, children: [] });
const parse = (source) => {
  const result = parseSelectorList(source);
  assert.equal(result.ok, true, source);
  return result.value;
};
function environment(overrides = {}) {
  return {
    tree: { data: (node) => node, children: (node) => node.children },
    documentMode: { syntax: "html", quirks: "no-quirks" },
    defaultNamespace: { kind: "any" },
    idValues: (node) => [node.id],
    classNames: () => [],
    resolveNamespacePrefix: () => ({ status: "unknown" }),
    attributeValueCaseSensitivity: () => "sensitive",
    matchPseudoClass: () => "unknown",
    ...overrides
  };
}
const ids = (result) => result.matches.map((node) => node.id);
const resourceFailure = (callback) => assert.throws(callback, (error) => error instanceof SyntaxResourceError && error.limitName === "maxSteps");

for (const size of [100, 500, 1000, 2000]) {
  test(`unfiltered sibling positions use linear evaluation work for ${String(size)} elements`, () => {
    const nodes = Array.from({ length: size }, (_, index) => element(String(index), index % 2 === 0 ? "P" : "p"));
    const root = other(nodes.flatMap((node) => [text(""), other(), node]));
    let reads = 0;
    const session = createSelectorMatchSession(root, environment({ tree: {
      data(node) { reads += 1; return node; }, children: (node) => node.children
    } }));
    const constructionReads = reads;
    for (const selector of [":nth-child(2n)", ":nth-last-child(2n)", ":nth-of-type(2n)", ":nth-last-of-type(2n)"]) {
      session.beginEvaluation({ limits: { maxSteps: size * 20 + 100 } });
      const result = session.query(parse(selector));
      assert.equal(result.matches.length, size / 2);
      assert.equal(reads, constructionReads, "structural evaluation must not reread every sibling");
      assert.ok(result.usage.steps >= size, result.usage);
      assert.equal(result.usage.nodes, 0, "construction and evaluation lifetimes are separate");
    }
    session.beginEvaluation({ limits: { maxSteps: 50 } });
    assert.equal(session.match(parse(`:nth-last-child(${String(size)})`), nodes[0]).status, "match");
    assert.equal(reads, constructionReads);
  });
}

test("sibling ranks preserve namespaces, HTML/XML case, and non-element children", () => {
  const children = [text("x"), element("a", "P"), other(), element("b", "p"), element("c", "P", SVG), element("d", "p", SVG), text("")];
  const root = other(children);
  const html = createSelectorMatchSession(root, environment());
  const xml = createSelectorMatchSession(root, environment({ documentMode: { syntax: "xml" } }));
  for (const [selector, expected] of [
    [":first-child", ["a"]], [":last-child", ["d"]], [":only-child", []],
    [":first-of-type", ["a", "c", "d"]], [":last-of-type", ["b", "c", "d"]],
    [":only-of-type", ["c", "d"]], [":nth-child(2)", ["b"]], [":nth-last-child(2)", ["c"]],
    [":nth-of-type(2)", ["b"]], [":nth-last-of-type(2)", ["a"]]
  ]) assert.deepEqual(ids(html.query(parse(selector))), expected, selector);
  assert.deepEqual(ids(xml.query(parse(":only-of-type"))), ["a", "b", "c", "d"]);
  const single = element("only");
  const singleton = createSelectorMatchSession(other([other(), single, text("")]), environment());
  assert.deepEqual(ids(singleton.query(parse(":only-child"))), ["only"]);
  assert.equal(createSelectorMatchSession(single, environment()).match(parse(":nth-child(1)"), single).status, "no-match");
});

test("empty exhaustive compounds stop planning before later pseudo callbacks", () => {
  let calls = 0;
  const root = other([element("one")]);
  const session = createSelectorMatchSession(root, environment({ pseudoClassCandidates() { calls += 1; return null; } }));
  for (const count of [10, 100, 1000]) {
    session.beginEvaluation({ limits: { maxSteps: 50 } });
    assert.deepEqual(ids(session.query(parse(`.absent ${Array(count).fill(":hover").join(" ")}`))), []);
    assert.equal(calls, 0);
    assert.ok(session.usage().steps > 1);
  }
  session.beginEvaluation({ limits: { maxSteps: 50 } });
  assert.deepEqual(ids(session.query(parse("absent:hover"))), []);
  assert.equal(calls, 0, "empty type seed also stops same-compound planning");
});

test("candidate callback cancellation stops before copying even one returned entry", () => {
  const node = element("one");
  const root = other([node]);
  const controller = new AbortController();
  let reads = 0;
  let callbacks = 0;
  const candidates = new Proxy([node, node], { get(target, key, receiver) {
    if (key === "0" || key === "1") reads += 1;
    return Reflect.get(target, key, receiver);
  } });
  const session = createSelectorMatchSession(root, environment({ pseudoClassCandidates() {
    callbacks += 1; controller.abort("candidate-stop"); return candidates;
  } }));
  session.beginEvaluation({ signal: controller.signal });
  const selector = parse(":hover :hover :hover");
  assert.throws(() => session.query(selector), (error) => error instanceof SyntaxAbortError && error.reason === "candidate-stop");
  assert.equal(callbacks, 1);
  assert.equal(reads, 0);
  assert.throws(() => session.query(parse(".absent")), SyntaxAbortError);
  session.beginEvaluation();
  assert.deepEqual(ids(session.query(parse(":nth-child(1)"))), ["one"]);
});

test("filtered nth scans are bounded and cancellation stops at the callback boundary", () => {
  const nodes = Array.from({ length: 2000 }, (_, index) => element(String(index)));
  const controller = new AbortController();
  let calls = 0;
  let cancel = true;
  const session = createSelectorMatchSession(other(nodes), environment({ matchPseudoClass() {
    calls += 1;
    if (cancel) controller.abort("filter-stop");
    return "match";
  } }));
  const selector = parse(":nth-child(1 of :hover)");
  session.beginEvaluation({ signal: controller.signal });
  assert.throws(() => session.match(selector, nodes.at(-1)), (error) => error instanceof SyntaxAbortError && error.reason === "filter-stop");
  assert.equal(calls, 1);
  cancel = false;
  session.beginEvaluation({ limits: { maxSteps: 40 } });
  calls = 0;
  resourceFailure(() => session.match(selector, nodes.at(-1)));
  assert.ok(calls < 10);
  session.beginEvaluation();
  assert.equal(session.match(selector, nodes[0]).status, "match");
});

test("filtered nth does not retain dynamic membership or reorder unknown reasons", () => {
  const nodes = [element("a"), element("b"), element("c")];
  let selected = nodes[0];
  const session = createSelectorMatchSession(other(nodes), environment({ matchPseudoClass(node, pseudo) {
    return pseudo.name === "hover" ? node === selected ? "match" : "no-match" : "unknown";
  } }));
  const dynamic = parse(":nth-child(1 of :hover)");
  for (const node of nodes) {
    selected = node;
    assert.deepEqual(ids(session.query(dynamic)), [node.id]);
  }
  const result = session.match(parse(":nth-last-child(1 of :focus, :active)"), nodes[0]);
  assert.equal(result.status, "unknown");
  assert.deepEqual(result.reasons.map((reason) => reason.name), ["focus", "active"]);
  assert.equal(result.reasons[0].span.start.offset, 21);
});

test("tiny caps stop external candidate construction and child copies early", () => {
  const node = element("one");
  const candidates = Array(10_000).fill(node);
  let reads = 0;
  const watched = new Proxy(candidates, { get(target, key, receiver) {
    if (/^\d+$/u.test(String(key))) reads += 1;
    return Reflect.get(target, key, receiver);
  } });
  const session = createSelectorMatchSession(other([node]), environment({ pseudoClassCandidates: () => watched }));
  session.beginEvaluation({ limits: { maxSteps: 30 } });
  resourceFailure(() => session.query(parse(":hover")));
  assert.ok(reads <= 30, String(reads));
  reads = 0;
  resourceFailure(() => createSelectorMatchSession(other(), environment({ tree: { data: (node) => node, children: () => watched } }), { limits: { maxSteps: 10 } }));
  assert.ok(reads <= 10, String(reads));
});

test("attribute and empty scans honor tiny caps and string input size", () => {
  const attributes = Array.from({ length: 1000 }, (_, index) => ({ namespace: null, localName: `a${String(index)}`, value: "x" }));
  const node = element("one", "p", HTML, Array.from({ length: 1000 }, () => other()), attributes);
  const session = createSelectorMatchSession(other([node]), environment());
  for (const selector of [":empty", "[a999]"]) {
    session.beginEvaluation({ limits: { maxSteps: 40 } });
    resourceFailure(() => session.match(parse(selector), node));
  }
  const big = element("big", "p", HTML, [], [{ namespace: null, localName: "value", value: "x".repeat(100_000) }]);
  const strings = createSelectorMatchSession(other([big]), environment());
  strings.beginEvaluation({ limits: { maxSteps: 100 } });
  resourceFailure(() => strings.match(parse('[value*="absent"]'), big));
});

test("failed operations clear scratch and preserve the original callback error", () => {
  const nodes = [element("a"), element("b")];
  const failure = new Error("host failed");
  let fail = true;
  let candidates = [nodes[0]];
  const session = createSelectorMatchSession(other(nodes), environment({
    pseudoClassCandidates: () => candidates,
    matchPseudoClass() { if (fail) throw failure; return "match"; }
  }));
  const selector = parse(":hover");
  assert.throws(() => session.query(selector), (error) => error === failure);
  fail = false;
  candidates = [nodes[1]];
  assert.deepEqual(ids(session.query(selector)), ["b"]);
  session.beginEvaluation({ limits: { maxSteps: 3 } });
  resourceFailure(() => session.query(selector));
  candidates = [nodes[0]];
  session.beginEvaluation();
  assert.deepEqual(ids(session.query(selector)), ["a"]);
});

test("construction callbacks observe cancellation before further host work", () => {
  for (const callback of ["data", "children", "idValues", "classNames"]) {
    const controller = new AbortController();
    let calls = 0;
    const node = element("one");
    const env = environment();
    const stop = (value) => { calls += 1; controller.abort(callback); return value; };
    if (callback === "data") env.tree.data = () => stop(node);
    if (callback === "children") env.tree.children = () => stop([]);
    if (callback === "idValues") env.idValues = () => stop([]);
    if (callback === "classNames") env.classNames = () => stop([]);
    assert.throws(() => createSelectorMatchSession(node, env, { signal: controller.signal }), (error) => error instanceof SyntaxAbortError && error.reason === callback);
    assert.equal(calls, 1);
  }
});

test("empty queries have a cumulative minimum charge and fresh zero-budget lifetimes", () => {
  const session = createSelectorMatchSession(other(), environment());
  const selector = parse(".absent");
  session.beginEvaluation();
  const once = session.query(selector).usage.steps;
  assert.ok(once > 0);
  assert.equal(session.query(selector).usage.steps, once * 2);
  session.beginEvaluation({ limits: { maxSteps: 0 } });
  assert.equal(session.usage().steps, 0);
  resourceFailure(() => session.query(selector));
  session.beginEvaluation();
  assert.deepEqual(ids(session.query(selector)), []);
});

test("cancellation at string callback boundaries is not masked by later work limits", () => {
  const node = element("one", "p", HTML, [], [{ namespace: null, localName: "a", value: "x".repeat(1000) }]);
  const controller = new AbortController();
  const session = createSelectorMatchSession(other([node]), environment({ attributeValueCaseSensitivity() {
    controller.abort("case-stop"); return "sensitive";
  } }));
  session.beginEvaluation({ signal: controller.signal, limits: { maxSteps: 100 } });
  assert.throws(() => session.match(parse('[a="x"]'), node), (error) => error instanceof SyntaxAbortError && error.reason === "case-stop");
  assert.throws(() => session.query(parse(".absent")), SyntaxAbortError);
});

test("failed compound types skip simple callbacks while unknown types keep three-valued decisions", () => {
  const node = element("one", "p");
  let calls = 0;
  let decision = "match";
  const session = createSelectorMatchSession(other([node]), environment({
    resolveNamespacePrefix: (prefix) => prefix === "svg"
      ? { status: "resolved", namespace: SVG } : { status: "unknown" },
    matchPseudoClass() { calls += 1; return decision; }
  }));
  for (const selector of ["div:hover", "svg|p:hover", "|p:hover"]) {
    session.beginEvaluation();
    assert.equal(session.match(parse(selector), node).status, "no-match", selector);
    assert.equal(calls, 0, selector);
  }
  for (const value of ["match", "unknown", "no-match"]) {
    decision = value;
    session.beginEvaluation();
    const result = session.match(parse("missing|p:hover"), node);
    assert.equal(result.status, value === "no-match" ? "no-match" : "unknown");
    if (result.status === "unknown") {
      assert.deepEqual(result.reasons.map((reason) => reason.name),
        value === "unknown" ? ["missing", "hover"] : ["missing"]);
      assert.equal(result.reasons[0].span.start.offset, 0);
    }
  }
  assert.equal(calls, 3);
  const xml = createSelectorMatchSession(other([node]), environment({
    documentMode: { syntax: "xml" },
    matchPseudoClass() { throw new Error("a failed XML type must stop first"); }
  }));
  assert.equal(xml.match(parse("P:hover"), node).status, "no-match");
});

test("compound refinement has no posting-size cliff at 256 or 257", () => {
  const steps = [];
  for (const size of [256, 257, 1000]) {
    const target = element("target", "span", HTML, [], [{ namespace: null, localName: "rel", value: "target" }]);
    const nodes = [
      ...Array.from({ length: size - 1 }, (_, index) => element(`span-${String(index)}`, "span")),
      ...Array.from({ length: size + 100 }, (_, index) => element(`link-${String(index)}`, "a", HTML, [], [
        { namespace: null, localName: "rel", value: "target" }
      ])),
      target
    ];
    const session = createSelectorMatchSession(other(nodes), environment());
    session.beginEvaluation({ limits: { maxSteps: size * 3 + 300 } });
    const result = session.query(parse('span[rel="target"]'));
    assert.deepEqual(ids(result), ["target"]);
    assert.deepEqual(result.unknown, []);
    steps.push(result.usage.steps);
    session.beginEvaluation({ limits: { maxSteps: 50 } });
    resourceFailure(() => session.query(parse('span[rel="target"]')));
  }
  assert.ok(steps[1] - steps[0] < 10, String(steps));
});

test("empty compound intersections avoid later candidate callbacks", () => {
  let calls = 0;
  const left = Array.from({ length: 200 }, (_, index) => element(`left-${String(index)}`));
  const right = Array.from({ length: 200 }, (_, index) => element(`right-${String(index)}`));
  const root = other([...left, ...right]);
  const session = createSelectorMatchSession(root, environment({
    classNames: (node) => node.id?.startsWith("left-") ? ["left"] : ["right"],
    pseudoClassCandidates() { calls += 1; throw new Error("unreachable callback"); },
    resolveNamespacePrefix() { calls += 1; throw new Error("unreachable namespace callback"); }
  }));
  for (const selector of [".left.right:hover", ".left.right:hover :focus", ".left.right :focus", ".left.right missing|p"]) {
    session.beginEvaluation();
    const result = session.query(parse(selector));
    assert.deepEqual(ids(result), [], selector);
    assert.deepEqual(result.unknown, [], selector);
    assert.equal(calls, 0, selector);
  }
});

test("reachable refinement bounds dense and high-fan-in postings without retaining results", () => {
  const size = 1000;
  const count = 100;
  const attributes = Array.from({ length: count }, (_, index) => ({ namespace: null, localName: `a${String(index)}`, value: "yes" }));
  const nodes = Array.from({ length: size }, (_, index) => element(String(index), "span", HTML, [], attributes));
  const session = createSelectorMatchSession(element("root", "main", HTML, nodes), environment({
    classNames: (node) => node === nodes.at(-1) ? ["needle"] : []
  }));
  const distinct = attributes.map((attribute) => `[${attribute.localName}]`).join("");
  for (const source of [distinct, "[a0]".repeat(count)]) {
    session.beginEvaluation({ limits: { maxSteps: 6000 } });
    assert.deepEqual(ids(session.query(parse('[a0="absent"]' + source + ".needle"))), []);
  }
  session.beginEvaluation({ limits: { maxSteps: 35_000 } });
  assert.deepEqual(ids(session.query(parse('[a0="absent"]' + "[a0]".repeat(count)))), []);
  session.beginEvaluation({ limits: { maxSteps: 35_000 } });
  assert.deepEqual(ids(session.query(parse('[a0="absent"]' + distinct))), []);
  session.beginEvaluation();
  assert.deepEqual(ids(session.query(parse("span[a0]"))), nodes.map((node) => node.id));
});

test("selective right seeds avoid refining unrelated left compound postings", () => {
  const target = element("target", "a");
  const rare = element("rare", "section", HTML, [target]);
  const outside = Array.from({ length: 5000 }, (_, index) => element(`outside-${String(index)}`, "section"));
  const session = createSelectorMatchSession(other([rare, ...outside]), environment({
    classNames: (node) => node.localName === "section" ? ["common"] : ["target"]
  }));
  session.beginEvaluation({ limits: { maxSteps: 250 } });
  assert.deepEqual(ids(session.query(parse("section.common > a.target"))), ["target"]);
});

test("dynamic left seeds remain selective and are resolved once per operation", () => {
  const target = element("target", "a");
  const focused = element("focused", "section", HTML, [target]);
  const outside = Array.from({ length: 5000 }, (_, index) => element(`outside-${String(index)}`, "a"));
  let calls = 0;
  const session = createSelectorMatchSession(other([focused, ...outside]), environment({
    pseudoClassCandidates(pseudo) { calls += 1; return pseudo.name === "focus" ? [focused] : null; },
    matchPseudoClass: (node) => node === focused ? "match" : "no-match"
  }));
  for (const selector of [":focus a", ":is(:focus) a"]) {
    calls = 0;
    session.beginEvaluation({ limits: { maxSteps: 250 } });
    assert.deepEqual(ids(session.query(parse(selector))), ["target"]);
    assert.equal(calls, 1);
  }
});

test("an empty preceding compound does not cache an unrelated compound as empty", () => {
  const left = element("left");
  const right = element("right");
  let calls = 0;
  const session = createSelectorMatchSession(other([left, right]), environment({
    classNames: (node) => [node.id],
    pseudoClassCandidates() { calls += 1; return [left]; },
    matchPseudoClass: () => "match"
  }));
  const parsed = parse(".left.right :focus, :focus");
  const selector = { ...parsed, selectors: [
    parsed.selectors[0],
    { ...parsed.selectors[1], compounds: [parsed.selectors[0].compounds[1]] }
  ] };
  session.beginEvaluation();
  assert.deepEqual(ids(session.query(selector)), ["left"]);
  assert.equal(calls, 1);
});

test("relative and logical seed discovery stay local with interleaved global postings", () => {
  const target = element("target", "a");
  const relativeTarget = element("relative-target", "p");
  const rare = element("rare", "p", HTML, [target, relativeTarget]);
  const outside = Array.from({ length: 5000 }, (_, index) => [
    element(`p${String(index)}`, "p"), element(`a${String(index)}`, "a")
  ]).flat();
  const session = createSelectorMatchSession(element("root", "main", HTML, [rare, ...outside]), environment({
    classNames: (node) => node.localName === "p" ? ["common"] : []
  }));
  for (const [source, expected] of [
    ["#rare:has(p.common)", ["rare"]],
    [":is(p.common) > #target", ["target"]],
    [":where(p.common) > #target", ["target"]],
    [":is(p.common, #missing) > #target", ["target"]],
    ["p.common missing|* #target", []]
  ]) {
    session.beginEvaluation({ limits: { maxSteps: 250 } });
    assert.deepEqual(ids(session.query(parse(source))), expected, source);
  }
});

test("dense and near-dense noncontiguous postings bound speculative joins by useful work", () => {
  const attributes = Array.from({ length: 100 }, (_, index) => ({ namespace: null, localName: `a${String(index)}`, value: "yes" }));
  for (const nearDense of [false, true]) {
    const nodes = Array.from({ length: 1000 }, (_, index) => [
      element(`p${String(index)}`, "p", HTML, [], nearDense ? attributes.filter((_, position) => position !== index) : attributes),
      element(`a${String(index)}`, "a")
    ]).flat();
    const session = createSelectorMatchSession(element("root", "main", HTML, nodes), environment());
    session.beginEvaluation({ limits: { maxSteps: 35_000 } });
    assert.deepEqual(ids(session.query(parse('[a0="absent"]' + attributes.map((entry) => `[${entry.localName}]`).join("")))), []);
  }
});

test("logical seed hints are fully checked before later host callbacks", () => {
  let calls = 0;
  const nodes = Array.from({ length: 200 }, (_, index) => [element(`left${String(index)}`), element(`right${String(index)}`)]).flat();
  const session = createSelectorMatchSession(other(nodes), environment({
    classNames: (node) => node.id.startsWith("left") ? ["left"] : ["right"],
    pseudoClassCandidates() { calls += 1; throw new Error("unreachable logical callback"); }
  }));
  for (const source of [
    ":is(.left.right):hover", ".left:is(.right):hover", ":where(.left.right) :hover",
    ".left.right:is(:hover)", ".left.right :is(:hover)", ":is(.left.right :hover)"
  ]) {
    session.beginEvaluation();
    assert.deepEqual(ids(session.query(parse(source))), [], source);
    assert.equal(calls, 0, source);
  }
});


test("relative sparse refinement preserves lazy bounded work on both sides of 256", () => {
  for (const size of [100, 256, 257]) {
    const rel = [{ namespace: null, localName: "rel", value: "target" }];
    const target = element("target", "span", HTML, [], rel);
    const nodes = [
      ...Array.from({ length: size - 1 }, (_, index) => element(`span${String(index)}`, "span")),
      ...Array.from({ length: size + 100 }, (_, index) => element(`link${String(index)}`, "a", HTML, [], rel)),
      target
    ];
    const root = element("root", "main", HTML, nodes);
    const session = createSelectorMatchSession(root, environment());
    session.beginEvaluation({ limits: { maxSteps: size * 3 + 300 } });
    assert.deepEqual(ids(session.query(parse('#root:has(span[rel="target"])'))), ["root"]);
  }
});
