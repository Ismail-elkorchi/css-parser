# @ismail-elkorchi/css-parser

A CSS syntax parser, serializer, CSSOM declaration model, property validator,
and Selectors Level 4 engine for Node.js, Deno, Bun, and modern browsers. It has
no runtime dependencies.

## Install

```sh
npm install @ismail-elkorchi/css-parser
```

```sh
deno add jsr:@ismail-elkorchi/css-parser
```

## Parse and serialize CSS

```ts
import { parseStylesheet, serialize } from "@ismail-elkorchi/css-parser";

const result = parseStylesheet(".card { color: red; margin: 1rem; }");
if (!result.ok) {
  throw new Error(result.errors.map((error) => error.message).join("\n"));
}

console.log(serialize(result.value));
```

Parse results are discriminated by `ok`. Successful results contain `value`,
recoverable `errors`, and measured `usage`. Resource or abort limits throw
`SyntaxResourceError` or `SyntaxAbortError`.

The package provides the CSS Syntax parsing entrypoints for stylesheets,
stylesheet contents, block contents, rules, declarations, component values, and
comma-separated component values. See the [API guide](./docs/api.md) for their
exact names and result types.

## Parse bytes and streams

`parseStylesheetBytes()` and `parseStylesheetStream()` apply the CSS encoding
detection order and include the selected encoding in their result.

```ts
import { parseStylesheetStream } from "@ismail-elkorchi/css-parser";

const response = await fetch("https://example.test/site.css");
if (response.body === null) throw new Error("Response has no body");

const result = await parseStylesheetStream(response.body, {
  limits: {
    maxInputBytes: 1_000_000,
    maxBufferedBytes: 64_000,
    maxTokens: 100_000,
    maxNodes: 50_000,
    maxDepth: 128,
    maxSteps: 1_000_000
  }
});
```

Stream decoding is incremental; tree construction starts after the decoded
stylesheet reaches EOF. `tokenizeBytes()` and `tokenizeStream()` expose the same
encoding and resource accounting for tokenization.

## CSSOM declarations and selectors

`CssDeclarationBlock` implements declaration parsing, priority, property-name,
mutation, and serialization semantics. `resolveCssProperty()` and
`validateCssPropertyValue()` use pinned WebRef grammar data. Applications that
validate repeated already-parsed values can use the bounded
`createPropertyValidationSession()` contract without reconstructing declaration
text.

`matchSelectorList()`, `querySelectorList()`, and reusable
`createSelectorMatchSession()` operations require an explicit typed
environment for tree access, namespaces, document mode, attributes, and dynamic
pseudo-classes. Their results preserve `match`, `no-match`, and `unknown`
outcomes instead of guessing. See [Selector matching](./docs/selectors.md).

## Traversal and source edits

`walkCss()`, `findNodeById()`, and `findNodesByKind()` operate on the typed
structural syntax tree. `computePatch()` plans source-preserving remove, replace,
and boundary insert edits against node spans; `applyPatch()` verifies and
applies the resulting plan.

Parsing and serialization are structural operations. They do not sanitize CSS,
resolve the cascade, or perform layout.

## Project information

- [API guide](./docs/api.md)
- [Selector matching](./docs/selectors.md)
- [Runnable examples](./examples/)
- [Development](./docs/development.md)
- [Security policy](./SECURITY.md)
- [Changelog](./CHANGELOG.md)

Node.js 20, 22, and 24 are tested. Cross-runtime qualification covers Node.js,
Deno, Bun, and Chromium. Release qualification also compares CSSOM
serialization with Chromium, Firefox, and WebKit.
