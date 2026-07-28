# Selector matching

`parseSelectorList()` parses Selectors Level 4 syntax into a discriminated,
source-located tree. Specificity is available through
`specificityOfComplexSelector()` and `specificitiesOfSelectorList()`.

The parser implements type, universal, id, class, attribute, nesting,
pseudo-class, and pseudo-element selectors; namespace prefixes; all Level 4
combinators; logical and relational pseudo-classes; `:nth-*()` forms; and the
selector-bearing arguments of `:host()`, `:host-context()`, `::slotted()`, and
related syntax. The known selector catalog is generated from the pinned WebRef
CSS package. Unknown pseudo names fail parsing instead of silently becoming
extensions.

## Environment

`matchSelectorList()` tests one node. `querySelectorList()` walks a root and
returns matches in tree order. Both require a `SelectorEnvironment<TNode>` so
the engine never guesses application semantics:

- `tree.data()` and `tree.children()` expose the caller-owned tree.
- `documentMode` distinguishes XML from the three HTML quirks modes.
- `defaultNamespace` and `resolveNamespacePrefix()` define namespace behavior.
- `idValues()` and `classNames()` define document-language identity rules.
- `attributeValueCaseSensitivity()` defines attribute-specific value matching.
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
implicit global cache. Pass deterministic resource limits, an abort signal,
optional `:scope` nodes, and an optional nesting selector through
`SelectorMatchOptions`.

Selector traversal rejects cyclic and shared-node graphs with
`SelectorTreeError`.
