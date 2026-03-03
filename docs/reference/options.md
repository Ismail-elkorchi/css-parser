# Options and API Reference

This page is the primary API surface summary for `@ismail-elkorchi/css-parser`.

## Core API

- `parse(input, options?)`
- `parseBytes(input, options?)`
- `parseStream(stream, options?)`
- `parseFragment(input, contextTagName, options?)`
- `serialize(treeOrNode)`
- `tokenize(input, options?)`
- `tokenizeStream(stream, options?)`
- `compileSelectorList(selectorText)`
- `querySelectorAll(compiledSelector, root)`

## Parse options

- `captureSpans?: boolean`
- `includeSpans?: boolean`
- `trace?: boolean`
- `transportEncodingLabel?: string`
- `context?: "stylesheet" | "fragment" | "rule-list" | "declaration-list"`
- `budgets?: BudgetOptions`

## BudgetOptions

- `maxInputBytes?: number`
- `maxBufferedBytes?: number`
- `maxTokens?: number`
- `maxNodes?: number`
- `maxDepth?: number`
- `maxTraceEvents?: number`
- `maxTraceBytes?: number`
- `maxTimeMs?: number`

## Determinism and failures

- Equal input and equal options produce stable parse structure and serialization output.
- Budget overruns throw `BudgetExceededError` with structured payload:
  - `code: "BUDGET_EXCEEDED"`
  - `budget`
  - `limit`
  - `actual`

## Verify these claims

```bash
npm run check:fast
npm run examples:run
npm run docs:lint:jsr
npm run docs:test:jsr
```
