# Options

## Parse APIs (`parse`, `parseBytes`, `parseFragment`, `parseRuleList`, `parseDeclarationList`, `parseStream`)

### `captureSpans`
- Type: `boolean`
- Default: `false`
- Includes source spans on parsed nodes.

### `includeSpans`
- Type: `boolean`
- Default: `false`
- Backward-compatible alias for `captureSpans`.

### `trace`
- Type: `boolean`
- Default: `false`
- Emits structured decode/token/parse/budget trace events.

### `transportEncodingLabel`
- Type: `string`
- Default: unset
- Optional transport hint for byte parsing.

### `context`
- Type: `string`
- Default: `"stylesheet"` for `parse`
- Used by fragment-oriented parsing paths.

### `budgets`
- Type: `ParseBudgets`
- Default: all limits unset (no budget enforcement unless specified)
- Supported keys:
  - `maxInputBytes`
  - `maxBufferedBytes` (stream decode)
  - `maxTokens`
  - `maxNodes`
  - `maxDepth`
  - `maxTraceEvents`
  - `maxTraceBytes`
  - `maxTimeMs`

## Tokenize APIs (`tokenize`, `tokenizeStream`)

### `TokenizeOptions.transportEncodingLabel`
- Type: `string`
- Default: unset

### `TokenizeOptions.budgets`
- Type: `ParseBudgets`
- Relevant keys: `maxInputBytes`, `maxBufferedBytes`, `maxTokens`, `maxTimeMs`

## Selector APIs

### `querySelectorAll(selector, root, options?)`

`options` is `SelectorQueryOptions`:
- `strict` (default `false`): fail on unsupported selector parts.
- `maxVisitedNodes` (default unset): bounds traversal work.

## Related
- [API overview](./api-overview.md)
- [Data model](./data-model.md)
- [Error model](./error-model.md)
- [Selector behavior](./selectors.md)
