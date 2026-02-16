# Parser specification (public API)

## Public functions
- `parse(css, options)`
- `parseBytes(bytes, options)`
- `parseStream(stream, options)`
- `parseFragment(css, context, options)`
- `parseRuleList(css, options)`
- `parseDeclarationList(css, options)`
- `tokenize(css, options)`
- `tokenizeStream(stream, options)`
- `serialize(treeOrNode)`
- `computePatch(originalCss, edits)`
- `applyPatchPlan(originalCss, plan)`
- `walk(tree, visitor)`
- `walkByType(tree, type, visitor)`
- `findById(tree, id)`
- `findAllByType(tree, type)`
- `compileSelectorList(selectorText)`
- `matchesSelector(selector, node, root, options?)`
- `querySelectorAll(selector, root, options?)`
- `outline(tree, options)`
- `chunk(tree, options)`
- `getParseErrorSpecRef(parseErrorId)`

## Parse contexts
Supported contexts:
- `stylesheet`
- `atrule`
- `atrulePrelude`
- `mediaQueryList`
- `mediaQuery`
- `condition`
- `rule`
- `selectorList`
- `selector`
- `block`
- `declarationList`
- `declaration`
- `value`

## Options and defaults
- `captureSpans`: `false`
- `includeSpans`: `false` (legacy alias for `captureSpans`)
- `trace`: `false`
- `transportEncodingLabel`: undefined
- `budgets.maxInputBytes`: undefined
- `budgets.maxBufferedBytes`: undefined
- `budgets.maxTokens`: undefined
- `budgets.maxNodes`: undefined
- `budgets.maxDepth`: undefined
- `budgets.maxTraceEvents`: undefined
- `budgets.maxTraceBytes`: undefined
- `budgets.maxTimeMs`: undefined
- `chunk.maxChars`: `8192`
- `chunk.maxNodes`: `256`
- `chunk.maxBytes`: unlimited

## Determinism contract
- Node IDs are assigned with deterministic pre-order incremental numbering.
- For equal input + options, parse output is stable.
- For equal input + options, tokenization output is stable.
- For equal input + options, serialization output is stable.
- Traversal and lookup helpers are stable in document order.

## Span precision
- Node spans are populated only when `captureSpans: true`.
- Spans use source offsets with half-open range semantics `[start, end)`.
- `spanProvenance` is `input` when span is captured, otherwise `none`.

## Budgets contract
- Budget violations throw `BudgetExceededError`.
- Error payload schema:
  - `code`: `BUDGET_EXCEEDED`
  - `budget`: `maxInputBytes` | `maxBufferedBytes` | `maxTokens` | `maxNodes` | `maxDepth` | `maxTraceEvents` | `maxTraceBytes` | `maxTimeMs`
  - `limit`: configured threshold
  - `actual`: observed value

## Trace schema
When `trace: true`, trace output is bounded by:
- `budgets.maxTraceEvents`
- `budgets.maxTraceBytes`

Event kinds:
- `decode`
- `token`
- `parse`
- `parseError`
- `budget`
- `stream`

## Selector contract
- Selector matching reads only `kind`/`type`, `tagName`, `attributes`, and `children`.
- Supported selector kinds are defined in `docs/selectors.md`.
- `strict: true` rejects unsupported selector parts by throwing.
- `maxVisitedNodes` bounds selector traversal and throws `BudgetExceededError` on overflow.

## Parse-error taxonomy
- `ParseError.parseErrorId` is deterministic for equal input/options.
- `getParseErrorSpecRef(parseErrorId)` returns `https://drafts.csswg.org/css-syntax/#error-handling`.
