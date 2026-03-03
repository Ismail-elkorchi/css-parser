# First Parse Walkthrough

This tutorial shows the minimum flow to parse CSS and run selector matching.

## 1. Parse a stylesheet

```ts
import { parse, serialize } from "@ismail-elkorchi/css-parser";

const tree = parse(".card { color: red; margin: 1px; }");
const css = serialize(tree);
console.log(css);
```

## 2. Parse bytes safely

```ts
import { parseBytes, serialize } from "@ismail-elkorchi/css-parser";

const bytes = new TextEncoder().encode(".title { font-weight: 700; }");
const tree = parseBytes(bytes);
console.log(serialize(tree));
```

## 3. Match selectors

```ts
import { compileSelectorList, querySelectorAll } from "@ismail-elkorchi/css-parser";

const selector = compileSelectorList("#content .card");
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

const matches = querySelectorAll(selector, root);
console.log(matches.length);
```

## 4. Run bundled examples

```bash
npm run examples:run
```
