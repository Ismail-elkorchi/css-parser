# Options

## Parse APIs (`parse`, `parseFragment`, `parseRuleList`, `parseDeclarationList`, `parseBytes`, `parseStream`)

### `captureSpans`
- Type: `boolean`
- Default: `false`

### `trace`
- Type: `boolean`
- Default: `false`

### `budgets`
- `maxInputBytes`
- `maxBufferedBytes` (streaming)
- `maxNodes`
- `maxDepth`
- `maxTraceEvents`
- `maxTraceBytes`

## Selector APIs

### `querySelectorAll(compiled, root, options?)`
- `strict`: fail on unsupported selector parts.
- `maxVisitedNodes`: bounds traversal during selection.

## Signal extraction APIs

### `extractStyleRuleSignals(tree, options?)`
- Options tune normalization and unsupported-selector handling.

### `extractRenderSignals(tree, options?)`
- Options tune included signal classes and declaration filtering.

## Related
- [API overview](./api-overview.md)
- [Error model](./error-model.md)
