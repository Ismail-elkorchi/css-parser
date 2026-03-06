# Avoid Selector And Tokenization Pitfalls

## Goal
Compile selectors once, detect unsupported parts early, and inspect token
streams when debugging parser or query surprises.

## Prerequisites
- `@ismail-elkorchi/css-parser` installed
- A selector string and a tree-like query root

## Copy/paste
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
console.log(compiled.parseErrors.length);
```

## Expected output
```txt
true
1
0
```

## Common failure modes
- Unsupported selector features are silently tolerated because `strict: true`
  was omitted.
- Query roots do not match `SelectorNodeLike`, so selectors appear to "miss"
  obvious elements.
- Token debugging starts from serialized CSS instead of the original source,
  which hides malformed author input.

## Related reference
- [Selector behavior](../reference/selectors.md)
- [Options](../reference/options.md)
- [Error model](../reference/error-model.md)
