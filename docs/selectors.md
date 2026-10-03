# Selector matching

`parseSelectorList()` parses Selectors Level 4 syntax into a discriminated,
source-located tree. Specificity is available through
`specificityOfComplexSelector()` and `specificitiesOfSelectorList()`.

`parseSelectorListFromComponentValues()` consumes an immutable component-value
sequence already returned by the syntax parser. Stylesheet processors can
compile a qualified-rule prelude without serializing and tokenizing it again.
The selector parser still applies its selector node, nesting, and step limits;
the caller retains ownership of the supplied syntax tree.

The parser implements type, universal, id, class, attribute, nesting,
pseudo-class, and pseudo-element selectors; namespace prefixes; all Level 4
combinators; logical and relational pseudo-classes; `:nth-*()` forms; and the
selector-bearing arguments of `:host()`, `:host-context()`, `::slotted()`, and
related syntax. The known selector catalog is generated from the pinned WebRef
CSS package. Unknown pseudo names fail parsing instead of silently becoming
extensions.

## Environment

`matchSelectorList()` tests one node. `querySelectorList()` walks a root and
returns matches in tree order. Applications that evaluate several selectors
against one immutable tree should create a `SelectorMatchSession` with
`createSelectorMatchSession()`. A session validates and indexes tree structure,
element names, IDs, classes, attribute names, document roots, and subtree
intervals once. It preserves tree order while joining selective compounds
across selector relationships. Candidate arrays carry document ordinals, so
two-way and k-way unions, intersections, HTML/foreign-content name joins, and
external pseudo-class filtering operate on the candidate sets rather than
rescanning the complete document. All entry points require a
`SelectorEnvironment<TNode>` so the engine never guesses application semantics:

- `tree.data()` and `tree.children()` expose the caller-owned tree.
- `documentMode` distinguishes XML from the three HTML quirks modes.
- `defaultNamespace` and `resolveNamespacePrefix()` define namespace behavior.
- `idValues()` and `classNames()` define document-language identity rules.
- `attributeValueCaseSensitivity()` defines attribute-specific value matching.
- `pseudoClassCandidates()` may provide an exhaustive candidate set for
  dynamic state; matching still verifies every candidate with
  `matchPseudoClass()`.
- `matchPseudoClass()` decides dynamic or host-defined state.

The tree adapter classifies nodes as `element`, `text`, or `other`. Element data
includes a namespace, local name, and namespace-aware attributes.

## Three-valued results

Single-node matching returns `status: "match"`, `"no-match"`, or `"unknown"`.
Unknown results carry source-located reasons for unresolved namespace prefixes
or pseudo-class state. Querying returns both `matches` and per-node `unknown`
entries. This keeps an unavailable browser state distinct from a definite
non-match.

The environment's pseudo-class hook uses the same `match`, `no-match`, and
`unknown` decisions. Structural pseudo-classes and selector-list pseudos are
evaluated by the engine; the hook supplies state the tree cannot contain.

## Reuse and limits

Parse a selector once and reuse its immutable syntax tree. Matching has no
implicit global cache. A selector match session owns its index explicitly.
Pass deterministic resource limits, an abort signal, optional `:scope` nodes,
and an optional nesting selector through `SelectorMatchOptions`. Session
construction validates the tree under those limits. `usage()` initially reports
construction plus cumulative matching work.

Call `session.beginEvaluation({ limits: { maxSteps }, signal })` before a new
batch of queries to reuse the structural index with a fresh cumulative step
budget and cancellation signal. All `match()` and `query()` calls in that batch
share the budget; it is not reset for each selector. `usage()` then reports only
that evaluation, starting at zero. Tree size and depth limits apply at session
construction, not to an already validated index. Omitting evaluation options
starts an unbounded evaluation without a signal; it does not retain the previous
budget or signal. A failed reset (invalid limits or an already aborted signal)
leaves the previous evaluation intact.

```ts
const session = createSelectorMatchSession(root, environment, {
  limits: { maxNodes: 50_000, maxDepth: 512, maxSteps: 500_000 }
});
// Later, after updating the environment's dynamic state:
session.beginEvaluation({ limits: { maxSteps: 100_000 }, signal });
const first = session.query(firstSelector);
const second = session.query(secondSelector);
```

The tree, element names, IDs, classes, and attributes must remain immutable for
the lifetime of a session. Dynamic pseudo-class state and namespace resolution
may change between operations. Candidate joins and matching decisions are
memoized only within each synchronous `match()` or `query()` call, so environment
callbacks must remain consistent during that call. The session retains scope
and nesting options across evaluation boundaries.

Relative `:has()` selectors traverse outward from their anchor. Descendant
relations can reuse candidate indexes restricted to that anchor's subtree;
child and sibling relations visit only related nodes. Descendant matching
reuses ancestor results within a query, including unknown reasons, without
repeatedly walking the same ancestry for every subject. All matches and unknown
entries remain in tree order.

Selector traversal rejects cyclic and shared-node graphs with
`SelectorTreeError`.
