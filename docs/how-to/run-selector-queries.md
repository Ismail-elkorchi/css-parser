# Run Selector Queries

Goal: compile selectors once and query deterministically.

```ts
import { compileSelectorList, querySelectorAll } from "@ismail-elkorchi/css-parser";

const tree = {
  kind: "document",
  children: [
    {
      kind: "element",
      tagName: "main",
      attributes: [{ name: "id", value: "content" }],
      children: [{ kind: "element", tagName: "div", attributes: [{ name: "class", value: "card" }], children: [] }]
    }
  ]
};

const selector = compileSelectorList("#content .card");
const matches = querySelectorAll(selector, tree);
console.log(matches.length);
```

Expected output:
- Deterministic node list ordering for repeated runs.
