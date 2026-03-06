# Parse A Declaration List

## Goal
Parse inline style declarations without wrapping them in a full rule or
stylesheet.

## Prerequisites
- `@ismail-elkorchi/css-parser` installed
- An inline style string such as the contents of `style=""`

## Copy/paste
```ts
import { parseDeclarationList, serialize } from "@ismail-elkorchi/css-parser";

const declarationList = parseDeclarationList("display:flex; gap: 12px; color: #333;");

console.log(declarationList.kind);
console.log(declarationList.children.length);
console.log(serialize(declarationList));
```

## Expected output
```txt
fragment
3
display:flex;gap:12px;color:#333
```

## Common failure modes
- Using `parseDeclarationList()` for full rules or at-rules instead of inline
  declarations only.
- Assuming the serializer preserves author whitespace instead of normalized CSS.
- Missing malformed tokens because the caller ignores `declarationList.errors`.

## Related reference
- [Options](../reference/options.md)
- [Error model](../reference/error-model.md)
- [Selector behavior](../reference/selectors.md)
