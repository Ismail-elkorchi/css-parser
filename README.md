# @ismail-elkorchi/css-parser

Deterministic CSS parsing and selector evaluation for automation pipelines that need stable output across Node, Deno, Bun, and modern browsers.

## When To Use

- You need deterministic CSS parse/serialize behavior for repeatable tooling.
- You need parse budgets to bound runtime work and memory growth.
- You need selector matching utilities in the same package as parsing.

## When Not To Use

- You need a browser layout engine.
- You need CSS sanitization or policy enforcement beyond parsing.
- You need runtime execution of scripts or DOM behavior.

## Install

```bash
npm install @ismail-elkorchi/css-parser
```

```bash
deno add jsr:@ismail-elkorchi/css-parser
```

## Quickstart

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

## Options and Config Reference

- [Options and API reference](https://github.com/Ismail-elkorchi/css-parser/blob/main/docs/reference/options.md)
- [API overview](https://github.com/Ismail-elkorchi/css-parser/blob/main/docs/reference/api-overview.md)

## Error Handling and Gotchas

- Treat `BudgetExceededError` as a normal guardrail for untrusted or huge stylesheets.
- `parseFragment()` and `parseRuleList()` are intended for partial CSS inputs.
- Selector matching is structural and deterministic, not a full browser cascade engine.
- Parsing validates structure; it does not enforce a CSS safety policy.

## Compatibility Matrix

| Runtime | Status | Notes |
| --- | --- | --- |
| Node.js | ✅ | CI + smoke coverage |
| Deno | ✅ | CI + smoke coverage |
| Bun | ✅ | CI + smoke coverage |
| Browser (evergreen) | ✅ | Smoke-tested behavior |

## Security Notes

Use explicit budgets for untrusted input and fail closed on `BudgetExceededError`. Parsing validates syntax structure, not trust or safety policy. See [SECURITY.md](https://github.com/Ismail-elkorchi/css-parser/blob/main/SECURITY.md).

## Design Constraints / Non-goals

- Deterministic parsing and selector matching are prioritized over browser-engine emulation.
- The package does not model layout, cascade side effects, or script-driven behavior.
- The package does not replace stylesheet sanitization or policy enforcement.

## Documentation Map

- [Tutorial](https://github.com/Ismail-elkorchi/css-parser/blob/main/docs/tutorial/first-parse.md)
- [How-to guides](https://github.com/Ismail-elkorchi/css-parser/tree/main/docs/how-to)
- [Reference](https://github.com/Ismail-elkorchi/css-parser/tree/main/docs/reference)
- [Explanation](https://github.com/Ismail-elkorchi/css-parser/tree/main/docs/explanation)

## Release Validation

```bash
npm run check:fast
npm run docs:lint:jsr
npm run docs:test:jsr
npm run examples:run
npm pack --dry-run
```

Release workflow details: [RELEASING.md](https://github.com/Ismail-elkorchi/css-parser/blob/main/RELEASING.md)
