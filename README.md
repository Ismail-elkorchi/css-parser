# @ismail-elkorchi/css-parser

Deterministic CSS parsing and selector utilities for automation across Node, Deno, Bun, and modern browsers.

No runtime dependencies: this package ships with zero runtime dependencies.

## When To Use

- You need deterministic CSS parse/serialize output.
- You need selector querying without browser-engine side effects.
- You need explicit resource budgets for untrusted stylesheets.

## When Not To Use

- You need browser layout/cascade computation.
- You need stylesheet sanitization and policy enforcement in one step.
- You need script or DOM runtime semantics.

## Install

```bash
npm install @ismail-elkorchi/css-parser
```

```bash
deno add jsr:@ismail-elkorchi/css-parser
```

## Import

```ts
import { parse } from "@ismail-elkorchi/css-parser";
```

```txt
import { parse } from "jsr:@ismail-elkorchi/css-parser";
```

## Copy/Paste Examples

### Example 1: Parse CSS

```ts
import { parse } from "@ismail-elkorchi/css-parser";

const tree = parse(".card { color: red; }");
console.log(tree.kind);
```

### Example 2: Parse streaming input

```ts
import { parseStream } from "@ismail-elkorchi/css-parser";

const stream = new ReadableStream({
  start(controller) {
    controller.enqueue(new TextEncoder().encode(".a{display:block}"));
    controller.close();
  }
});

const tree = await parseStream(stream, { budgets: { maxInputBytes: 4096, maxBufferedBytes: 512 } });
console.log(tree.kind);
```

### Example 3: Query selectors

```ts
import { compileSelectorList, querySelectorAll } from "@ismail-elkorchi/css-parser";

const selector = compileSelectorList(".card");
console.log(selector.supported, querySelectorAll(selector, { kind: "document", children: [] }).length);
```

### Example 4: Extract render signals

```ts
import { extractRenderSignals, parse } from "@ismail-elkorchi/css-parser";

const tree = parse(".card { color: red; }");
console.log(extractRenderSignals(tree).length >= 0);
```

Run packaged examples:

```bash
npm run examples:run
```

## Compatibility

Runtime compatibility matrix:

| Runtime | Status |
| --- | --- |
| Node.js | Supported |
| Deno | Supported |
| Bun | Supported |
| Browser (evergreen) | Supported |

## Security and Safety Notes

Parsing is not sanitization. For untrusted input:
- configure strict budgets,
- handle `BudgetExceededError` explicitly,
- apply separate policy checks before execution or rendering.

## Documentation

- [Docs index](./docs/index.md)
- [First parse success tutorial](./docs/tutorial/first-parse.md)
- [Options reference](./docs/reference/options.md)
