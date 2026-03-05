# Parse A Declaration List

Goal: parse inline style declarations without wrapping them in a full rule.

```ts
import { parseDeclarationList, serialize } from "@ismail-elkorchi/css-parser";

const declarationList = parseDeclarationList("display:flex; gap: 12px; color: #333;");

console.log(declarationList.kind);
console.log(serialize(declarationList));
```

Expected output:
- `fragment`
- A normalized declaration list such as `display:flex;gap:12px;color:#333`
