# API Overview

All exported runtime entrypoints from `src/public/mod.ts`.

## Error classes
- `BudgetExceededError`
- `PatchPlanningError`

## Parsing and encoding
- `parse(input, options?)`
- `parseFragment(input, context?, options?)`
- `parseRuleList(input, options?)`
- `parseDeclarationList(input, options?)`
- `getParseErrorSpecRef(parseErrorId)`
- `tokenize(input, options?)`
- `tokenizeStream(stream, options?)`
- `parseBytes(input, options?)`
- `parseStream(stream, options?)`
- `serialize(treeOrNode)`

## Tree traversal and search
- `walk(nodeOrTree, visitor)`
- `walkByType(nodeOrTree, type, visitor)`
- `findById(nodeOrTree, id)`
- `findAllByType(nodeOrTree, type)`
- `outline(nodeOrTree)`
- `chunk(nodeOrTree, options?)`

## Patch planning
- `applyPatchPlan(originalCss, plan)`
- `computePatch(originalCss, edits)`

## Selector utilities
- `compileSelectorList(selectorText)`
- `matchesSelector(compiled, node, root)`
- `querySelectorAll(compiled, root, options?)`

## Signal extraction
- `extractStyleRuleSignals(tree, options?)`
- `extractInlineStyleSignals(styleText, options?)`
- `extractRenderSignals(tree, options?)`
- `extractInlineRenderSignals(styleText, options?)`

## Related
- [Options](./options.md)
- [Error model](./error-model.md)
- [Selector behavior](./selectors.md)
