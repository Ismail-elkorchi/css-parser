# Avoid Selector And Tokenization Pitfalls

Goal: compile selectors once, detect unsupported parts early, and inspect token streams when debugging.

```ts
import { compileSelectorList, querySelectorAll, tokenize } from "@ismail-elkorchi/css-parser";

const css = "#content .card[data-kind='promo']{display:block}";
const tokens = tokenize(css);
console.log(tokens.length > 0);

const compiled = compileSelectorList("#content .card[data-kind='promo']");
const tree = {
  kind: "document",
  children: [
    {
      kind: "element",
      tagName: "main",
      attributes: [{ name: "id", value: "content" }],
      children: [
        {
          kind: "element",
          tagName: "div",
          attributes: [
            { name: "class", value: "card" },
            { name: "data-kind", value: "promo" }
          ],
          children: []
        }
      ]
    }
  ]
};

const matches = querySelectorAll(compiled, tree, { strict: true });
console.log(matches.length);
```

Expected output:
- Tokenization succeeds (`true`).
- Selector query returns deterministic match counts (`1`).
