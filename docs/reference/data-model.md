# Data Model

## Parse Output Shape

`parse` and `parseBytes` return a `StyleSheetTree`:
- `kind: "stylesheet"`
- `context: "stylesheet"`
- `root: CssNode`
- `children: CssNode[]`
- `errors: ParseError[]`
- optional `trace: TraceEvent[]`

Fragment parsing (`parseFragment`, `parseRuleList`, `parseDeclarationList`) returns a `FragmentTree` with `kind: "fragment"` and the requested parse `context`.

## Node Model

`CssNode` is a structural node record with:
- stable `id`
- parser `type`
- optional `span` and `spanProvenance`
- node-specific fields depending on `type`

## Traversal

- Selector flows: use `compileSelectorList` + `querySelectorAll` (and `matchesSelector` on Node/npm).
- Structural flows: use traversal helpers from the Node/npm surface (`walk`, `walkByType`, `findById`, `findAllByType`).

## Serialization

`serialize(treeOrNode)` emits normalized CSS text from parsed trees or node subtrees.

## Errors And Budgets

- Non-fatal parser diagnostics are returned in `errors` with stable `parseErrorId` values.
- Budget violations throw `BudgetExceededError`.
- Patch planning violations throw `PatchPlanningError`.

Budget controls live in `ParseOptions.budgets` and bound bytes, token count, node count, depth, trace size, and parse time.
