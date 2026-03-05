# Selector Behavior

`css-parser` selector support is deterministic and intentionally explicit.

## Supported flow
1. Compile once with `compileSelectorList()`.
2. Inspect `supported` and `unsupportedParts`.
3. Query repeatedly with `querySelectorAll()`.

## Strict mode

Use strict mode when unsupported selectors must fail immediately.

```ts
import { compileSelectorList, querySelectorAll } from "@ismail-elkorchi/css-parser";

const compiled = compileSelectorList(":hover");
querySelectorAll(compiled, { kind: "document", children: [] }, { strict: true });
```

Expected result:
- Throws when unsupported selector parts are present.
