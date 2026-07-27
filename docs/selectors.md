# Selector Support

`compileSelectorList()` parses a selector once and records supported and unsupported parts. `querySelectorAll()` and `matchesSelector()` accept either the compiled result or selector text.

The query root is a `SelectorNodeLike` tree. Element-like nodes use `tagName`, an `attributes` array, and `children`.

Supported matching includes:

- type and universal selectors,
- ids and classes,
- attribute selectors with `=`, `~=`, `|=`, `^=`, `$=`, and `*=`,
- descendant and child combinators.

Inspect `compiled.supported`, `compiled.parseErrors`, and `compiled.unsupportedParts` before reuse. Pass `{ strict: true }` to query helpers when unsupported selector syntax must throw instead of producing a best-effort result.

`maxVisitedNodes` bounds traversal and throws `BudgetExceededError` when exceeded. Results follow document order and cyclic object graphs are visited once.
