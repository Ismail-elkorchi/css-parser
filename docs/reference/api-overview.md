# API Overview

This page tracks exported public functions from `src/public/mod.ts`.

## Parsing and encoding
- `parse`
- `parseFragment`
- `parseRuleList`
- `parseDeclarationList`
- `parseBytes`
- `parseStream`
- `tokenize`
- `tokenizeStream`
- `getParseErrorSpecRef`

## Traversal and analysis
- `walk`
- `walkByType`
- `findById`
- `findAllByType`
- `outline`
- `chunk`

## Serialization and patching
- `serialize`
- `computePatch`
- `applyPatchPlan`

## Selectors and render signals
- `compileSelectorList`
- `matchesSelector`
- `querySelectorAll`
- `extractStyleRuleSignals`
- `extractInlineStyleSignals`
- `extractRenderSignals`
- `extractInlineRenderSignals`

For full behavior and type contracts, see [`docs/spec.md`](../spec.md).
