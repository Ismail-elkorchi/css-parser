# API Overview

## JSR Surface

JSR exports are defined by [`jsr/mod.ts`](../../jsr/mod.ts).

Primary JSR runtime exports:
- `parse(input, options?)`
- `parseBytes(input, options?)`
- `parseFragment(input, contextTagName, options?)`
- `parseRuleList(input, options?)`
- `parseDeclarationList(input, options?)`
- `parseStream(stream, options?)`
- `tokenize(input, options?)`
- `tokenizeStream(stream, options?)`
- `serialize(input)`
- `compileSelectorList(selectorText)`
- `querySelectorAll(selector, root, options?)`

Primary JSR type exports:
- `ParseBudgets`, `ParseOptions`, `TokenizeOptions`
- `StyleSheetTree`, `FragmentTree`, `CssNode`, `ParseError`
- `CssSerializable`, `CssToken`, `CompiledSelectorList`, `SelectorNodeLike`, `SelectorQueryOptions`

## Node/npm Surface

Node/npm type surface is shipped from `dist/mod.d.ts` (source: `src/public/mod.ts`).

In addition to JSR exports, Node/npm includes:
- `matchesSelector(...)`
- `BudgetExceededError`, `PatchPlanningError`, `getParseErrorSpecRef(parseErrorId)`
- traversal/search helpers (`walk`, `walkByType`, `findById`, `findAllByType`, `outline`, `chunk`)
- patch planning helpers (`computePatch`, `applyPatchPlan`)
- signal extraction helpers (`extractStyleRuleSignals`, `extractInlineStyleSignals`, `extractRenderSignals`, `extractInlineRenderSignals`)

## JSR Surface vs Node Surface

- JSR exposes parse/tokenize/selector primitives for portable Deno/JSR use.
- Node/npm additionally exposes authoring workflows (patching, traversal, and signal extraction).
- Shared types (`ParseOptions`, selector types, parse trees) are intentionally aligned.

## Related
- [Options](./options.md)
- [Data model](./data-model.md)
- [Error model](./error-model.md)
- [Selector behavior](./selectors.md)
