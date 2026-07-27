# Trees, Traversal, and Source Edits

`parse()` returns a `StyleSheetTree`; fragment APIs return a `FragmentTree`. Both expose:

- a stable result discriminator and parse context,
- the root `CssNode`,
- top-level `children`,
- recoverable `errors`,
- optional trace events.

Nodes have a numeric `id`, a CSSTree node `type`, optional input `span`, and node-specific fields. The model is a structural syntax tree, not a DOM or computed-style model.

## Serialization

`serialize(treeOrNode)` emits normalized CSS. It does not preserve author whitespace.

## Traversal

- `walk()` visits every node with its depth.
- `walkByType()` visits nodes matching a type.
- `findById()` resolves a node id.
- `findAllByType()` yields matching nodes.
- `outline()` returns a compact list of rules, at-rules, declarations, and selectors.
- `chunk()` groups top-level syntax into bounded serialized chunks.

## Source edits

Parse with `captureSpans: true` before inspecting source locations. `computePatch(originalCss, edits)` accepts remove, replace, insert-before, and insert-after operations targeting node ids. It returns a deterministic `PatchPlan`; `applyPatchPlan()` applies that plan to the original source.

Edits fail with `PatchPlanningError` when the target is missing, lacks an input-derived span, or overlaps another edit.
