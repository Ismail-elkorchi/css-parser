# css-parser

Agent-first TypeScript CSS parser with deterministic output, bounded execution, and zero runtime dependencies.

`docs/spec.md` is the normative API contract. This README is operational guidance.

## What this library is
- Deterministic CSS parsing and serialization for agent and automation workflows.
- Web-API-first runtime design that runs on Node, Deno, Bun, and modern browsers.
- Structured budgeting and trace output for bounded, explainable parsing.
- Patch planning primitives for deterministic rewrite workflows.
- No runtime dependencies are used by production library code.

## Runtime compatibility
- Node.js: current stable and active LTS with Web Streams and TextDecoder support.
- Deno: stable channel.
- Bun: stable channel.
- Browsers: modern evergreen engines.

See `docs/runtime-compatibility.md` for the exact runtime API surface used by `src/`.

## Security
Security policy and reporting process: `SECURITY.md`.

## Install status
- npm publication is disabled while alpha hardening is active (`private: true`).
- Intended public package identity: `@ismail-elkorchi/css-parser`.

## Quickstart

### Parse a stylesheet
```ts
import { parse, serialize } from "@ismail-elkorchi/css-parser";

const tree = parse(".card { color: red; margin: 1px; }");
const css = serialize(tree);
```

### Parse bytes with encoding sniff
```ts
import { parseBytes } from "@ismail-elkorchi/css-parser";

const bytes = new TextEncoder().encode(".x { color: red; }");
const tree = parseBytes(bytes);
```

### Parse a stream
```ts
import { parseStream } from "@ismail-elkorchi/css-parser";

const stream = new ReadableStream<Uint8Array>({
  start(controller) {
    controller.enqueue(new TextEncoder().encode(".a{"));
    controller.enqueue(new TextEncoder().encode("color:red}"));
    controller.close();
  }
});

const tree = await parseStream(stream, {
  budgets: {
    maxInputBytes: 1024,
    maxBufferedBytes: 256
  }
});
```

### Tokenize a stream
```ts
import { tokenizeStream } from "@ismail-elkorchi/css-parser";

const stream = new ReadableStream<Uint8Array>({
  start(controller) {
    controller.enqueue(new TextEncoder().encode(".a{display:block}"));
    controller.close();
  }
});

for await (const token of tokenizeStream(stream)) {
  console.log(token.rawKind, token.value);
}
```

### Match selectors against a node tree
```ts
import { compileSelectorList, querySelectorAll } from "@ismail-elkorchi/css-parser";

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

const selector = compileSelectorList("#content .card");
const nodes = querySelectorAll(selector, root);
```

### Compute and apply patch plan
```ts
import { applyPatchPlan, computePatch, findAllByType, parse } from "@ismail-elkorchi/css-parser";

const originalCss = ".a{color:red}.b{margin:1px}";
const tree = parse(originalCss, { captureSpans: true });
const rules = [...findAllByType(tree, "Rule")];

const plan = computePatch(originalCss, [
  { kind: "replaceNode", target: rules[0]!.id, css: ".a{color:blue}" },
  { kind: "insertCssAfter", target: rules[1]!.id, css: ".c{padding:2px}" }
]);

const patchedCss = applyPatchPlan(originalCss, plan);
```

## Determinism contract
For equal input and equal options:
- parse output structure is stable,
- NodeId assignment order is stable,
- serialization output is stable,
- trace event sequence is stable when enabled under the same budgets,
- token stream output is stable.
- Cross-runtime smoke evaluation enforces hash equality of canonical parse output across Node, Deno, and Bun.

## Budgets contract
Budget violations throw `BudgetExceededError` with structured payload:
- `code`: `BUDGET_EXCEEDED`
- `budget`: one of the supported budget keys
- `limit`: configured threshold
- `actual`: observed value

## Conformance and quality gates
See:
- `docs/acceptance-gates.md`
- `docs/phase1-hard-gates.md`
- `evaluation.config.json`
- `scripts/eval/run-eval.mjs`

## License
MIT (`LICENSE`).
