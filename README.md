# @ismail-elkorchi/css-parser

Deterministic CSS parsing and selector evaluation for automation pipelines that need stable output across Node, Deno, Bun, and modern browsers.

## Install

```bash
npm install @ismail-elkorchi/css-parser
```

```bash
deno add jsr:@ismail-elkorchi/css-parser
```

```txt
import { parse } from "jsr:@ismail-elkorchi/css-parser";
```

## Success Path

```ts
import {
  compileSelectorList,
  parse,
  parseStream,
  querySelectorAll,
  serialize
} from "@ismail-elkorchi/css-parser";

const css = ".card { color: red; } #content .card { margin: 1px; }";
const parsed = parse(css, {
  budgets: { maxInputBytes: 4096, maxNodes: 256, maxDepth: 32 }
});

const stream = new ReadableStream({
  start(controller) {
    controller.enqueue(new TextEncoder().encode(".a{display:block}"));
    controller.close();
  }
});

const streamed = await parseStream(stream, {
  budgets: { maxInputBytes: 4096, maxBufferedBytes: 256, maxNodes: 256 }
});

const selector = compileSelectorList("#content .card");
const root = {
  kind: "document",
  children: [{ kind: "element", tagName: "main", attributes: [{ name: "id", value: "content" }], children: [] }]
};

console.log(querySelectorAll(selector, root).length);
console.log(serialize(parsed));
console.log(serialize(streamed));
```

Runnable examples:

```bash
npm run examples:run
```

## Options / API Reference

- [Options and API reference](./docs/reference/options.md)

## When To Use

- You need deterministic CSS parse/serialize behavior for repeatable tooling.
- You need parse budgets to bound runtime work and memory growth.
- You need selector matching utilities in the same package as parsing.

## When Not To Use

- You need a browser layout engine.
- You need CSS sanitization or policy enforcement beyond parsing.
- You need runtime execution of scripts or DOM behavior.

## Security Note

Use explicit budgets for untrusted input and fail closed on `BudgetExceededError`. Parsing validates syntax structure, not trust or safety policy. See [SECURITY.md](./SECURITY.md).

## Runtime Compatibility

- Node.js (current LTS and current stable)
- Deno (stable)
- Bun (stable)
- Modern evergreen browsers (smoke-tested)

## No Runtime Dependencies

No runtime dependencies are used by production parser code.

## Docs Map

- [Documentation index](./docs/index.md)

## Release Trigger

See [RELEASING.md](./RELEASING.md) for required secrets, trigger methods, and post-publish checks.
