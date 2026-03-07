# Parse A Stylesheet

## Goal
Parse a full stylesheet into a deterministic tree and verify that the result is
ready for later inspection or serialization.

## Prerequisites
- `@ismail-elkorchi/css-parser` installed
- A stylesheet string or bytes payload

## Copy/paste
```ts
import { parse, serialize } from "@ismail-elkorchi/css-parser";

const css = `
  :root { --brand: #0057b8; }
  .card { color: var(--brand); padding: 8px; }
`;

const tree = parse(css, {
  budgets: {
    maxInputBytes: 8_192,
    maxNodes: 1_024,
    maxDepth: 64
  }
});

console.log(tree.kind);
console.log(tree.children.length > 0);
console.log(serialize(tree).includes(".card"));
```

## Expected output
```txt
stylesheet
true
true
```

## Common failure modes
- `BudgetExceededError` when `maxInputBytes`, `maxNodes`, or `maxDepth` is too
  low for the stylesheet size.
- Using `parse()` for inline declarations that should be handled with
  `parseDeclarationList()`.
- Expecting layout or cascade answers from a syntax parser; `css-parser`
  returns structure, not computed style.

## Related reference
- [Options](../reference/options.md)
- [Data model](../reference/data-model.md)
- [Error model](../reference/error-model.md)
