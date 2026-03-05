# Parse A Stylesheet

Goal: parse a full stylesheet and inspect stable rule counts.

```ts
import { parse } from "@ismail-elkorchi/css-parser";

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
```

Expected output:
- `stylesheet`
- `true`
