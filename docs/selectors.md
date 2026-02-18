# Selector contract (v1)

This document defines the selector matching surface that is enforced by evaluation gates.

## API
- `compileSelectorList(selectorText)`
- `matchesSelector(selector, node, root, options?)`
- `querySelectorAll(selector, root, options?)`

## Input node model
Selector matching reads only these fields from each node:
- `kind` or `type` to identify element nodes (`"element"` case-insensitive)
- `tagName`
- `attributes` as `[{ name, value }]`
- `children`

Any additional fields are ignored by selector matching.

## Supported selector surface
- Type selectors (`div`, `main`, `*`)
- ID selectors (`#id`)
- Class selectors (`.class`)
- Attribute selectors:
  - presence: `[name]`
  - exact: `[name="value"]`
  - list contains: `[name~="token"]`
  - prefix or exact with dash boundary: `[name|="value"]`
  - starts with: `[name^="value"]`
  - ends with: `[name$="value"]`
  - contains substring: `[name*="value"]`
  - case-insensitive flag `i`
- Combinators:
  - descendant (` `)
  - child (`>`)
- Selector lists separated by `,`

## Unsupported selector surface
Unsupported parts are recorded in `CompiledSelector.unsupportedParts`.
Examples: pseudo classes, pseudo elements, sibling combinators.

With `options.strict === true`, unsupported parts are fatal and query functions throw.
Without strict mode, unsupported selectors return no matches.

## Determinism
For stable input nodes and stable selector input:
- `compileSelectorList` output is stable.
- `querySelectorAll` returns stable order.
- `matchesSelector` returns stable booleans.

## Budget behavior
- `options.maxVisitedNodes` bounds traversal.
- Exceeding the limit throws `BudgetExceededError` with:
  - `code: "BUDGET_EXCEEDED"`
  - `budget: "maxNodes"`

## Evidence surface
- Fixtures: `test/fixtures/selectors/v1/cases.json`
- Control tests: `test/control/selectors.test.js`
- Eval artifact: `reports/selectors.json`

## Example
```ts
import { compileSelectorList, querySelectorAll } from "@ismail-elkorchi/css-parser";

const root = {
  kind: "document",
  children: [
    {
      kind: "element",
      tagName: "main",
      attributes: [{ name: "id", value: "content" }],
      children: [
        {
          kind: "element",
          tagName: "section",
          attributes: [{ name: "class", value: "card" }],
          children: []
        }
      ]
    }
  ]
};

const compiled = compileSelectorList("#content .card");
const matches = querySelectorAll(compiled, root);
```
