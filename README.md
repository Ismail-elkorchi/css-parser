# @ismail-elkorchi/css-parser

A CSS parser for Node.js, Deno, Bun, and modern browsers. It provides stylesheet and fragment parsing, byte and stream decoding, serialization, selector queries, source-based edits, traversal helpers, and render-signal extraction.

The package has no installed runtime dependencies. Its parser runtime is a vendored build of [CSSTree](https://github.com/csstree/csstree); see [third-party notices](./THIRD_PARTY_NOTICES.md).

## Install

```sh
npm install @ismail-elkorchi/css-parser
```

```sh
deno add jsr:@ismail-elkorchi/css-parser
```

## Parse CSS

```ts
import { parse, serialize } from "@ismail-elkorchi/css-parser";

const stylesheet = parse(".card { color: red; margin: 1rem; }");

if (stylesheet.errors.length > 0) {
  throw new Error(stylesheet.errors.map((error) => error.message).join("\n"));
}

console.log(serialize(stylesheet)); // .card{color:red;margin:1rem}
```

`parseDeclarationList()` handles inline `style` text, while `parseRuleList()` and `parseFragment()` handle other CSS parse contexts.

## Bytes and streams

`parseBytes()` follows CSS encoding detection. `parseStream()` enforces byte and buffering limits while decoding chunks, then builds the tree after the complete stylesheet has been decoded.

```ts
import { parseStream } from "@ismail-elkorchi/css-parser";

const response = await fetch("https://example.test/site.css");
if (!response.body) throw new Error("Response has no body");

const stylesheet = await parseStream(response.body, {
  budgets: {
    maxInputBytes: 1_000_000,
    maxBufferedBytes: 64_000,
    maxTokens: 100_000,
    maxNodes: 50_000,
    maxDepth: 128,
    maxTimeMs: 2_000
  }
});
```

Exceeded limits throw `BudgetExceededError`. Parsing is structural analysis, not sanitization or cascade/layout evaluation.

## Query a document-like tree

```ts
import { compileSelectorList, querySelectorAll } from "@ismail-elkorchi/css-parser";

const selector = compileSelectorList("#content > .card");
if (!selector.supported) {
  throw new Error("The selector contains unsupported features");
}

const root = {
  kind: "document",
  children: [{
    kind: "element",
    tagName: "main",
    attributes: [{ name: "id", value: "content" }],
    children: [{
      kind: "element",
      tagName: "article",
      attributes: [{ name: "class", value: "card" }],
      children: []
    }]
  }]
};

console.log(querySelectorAll(selector, root, { strict: true }).length); // 1
```

## Documentation

- [Documentation index](./docs/index.md)
- [Parsing, diagnostics, and budgets](./docs/parsing.md)
- [Trees, traversal, and source edits](./docs/trees-and-editing.md)
- [Selector support](./docs/selectors.md)
- [Style and render signals](./docs/render-signals.md)
- [Development and releases](./docs/development.md)
- [Runnable examples](./examples/)
- [Security policy](./SECURITY.md)

Node.js 20, 22, and 24 are tested. Cross-runtime qualification covers Node.js, Deno, Bun, and Chromium; release qualification also compares serialization with Chromium, Firefox, and WebKit CSSOM.
