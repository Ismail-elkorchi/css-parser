# API guide

The package exports one TypeScript contract from npm and JSR.

## Text input

Each parser accepts a JavaScript string and optional `SyntaxParserOptions`:

- `parseStylesheet()`
- `parseStylesheetContents()`
- `parseBlockContents()`
- `parseRule()`
- `parseDeclaration()`
- `parseComponentValue()`
- `parseComponentValues()`
- `parseCommaSeparatedComponentValues()`

`tokenize()` accepts `TokenizerOptions`. It returns tokens, tokenizer
diagnostics, and measured resource usage.

Parser results are a discriminated union:

```ts
type SyntaxResult<T> =
  | { readonly ok: true; readonly value: T; readonly errors: readonly SyntaxDiagnostic[]; readonly usage: ResourceUsage }
  | { readonly ok: false; readonly errors: readonly SyntaxDiagnostic[]; readonly usage: ResourceUsage };
```

Recoverable syntax diagnostics stay in `errors`; deterministic resource limits
and cancellation throw `SyntaxResourceError` and `SyntaxAbortError`.

## Bytes and streams

- `parseStylesheetBytes()` and `tokenizeBytes()` accept a complete
  `Uint8Array`.
- `parseStylesheetStream()` and `tokenizeStream()` accept a
  `ReadableStream<Uint8Array>`.

Their results add an `encoding` decision with its canonical name, decision
source, and consumed BOM byte count. Byte options accept transport, environment,
and default encoding labels plus `maxCharsetBytes`.

Available deterministic limits are:

- `maxInputBytes`
- `maxBufferedBytes`
- `maxTokens`
- `maxNodes`
- `maxDepth`
- `maxSteps`

`maxBufferedBytes` applies to bytes retained while a stream's encoding is
undecided. Stream decoding is incremental, but parsing and tokenization start
after EOF because CSS tokens can cross arbitrary chunk boundaries.

## Syntax tree

Every structural node has a positive tree-local `id`, a half-open source `span`,
and a `kind` discriminator. The structural node kinds are `stylesheet`,
`at-rule`, `qualified-rule`, `block`, `declaration`, `function-block`, and
`simple-block`. Preserved tokens are discriminated component values rather than
structural nodes.

`serialize()` validates caller-constructed syntax graphs before normalizing
them. Invalid, cyclic, shared, or duplicate-id structures throw
`CssSerializationError`. `serializeCssComponentValues()` serializes a component
value list.

`walkCss()` visits structural nodes in depth-first order.
`findNodeById()` and `findNodesByKind()` provide exact typed lookup.

## Source edits

`computePatch(source, stylesheet, edits)` accepts edits discriminated as
`remove-node`, `replace-node`, `insert-before`, or `insert-after`. Targets are
tree-local node identifiers and replacement or insertion edits carry a `css`
string.

The returned `PatchPlan` contains explicit unchanged and replacement ranges plus
the expected result. `applyPatch(source, plan)` rejects altered, incomplete, or
out-of-bounds plans with `PatchPlanningError`.

## CSSOM and property semantics

`CssDeclarationBlock.parse()` builds a mutable declaration block. Its
`setProperty()` result is discriminated as `set`, `removed`, or `ignored`;
ignored results explain whether priority, property name, or value was invalid.
The class also exposes CSSOM-style lookup, removal, indexed names,
`declarations`, and normalized `cssText`.

`resolveCssProperty()` returns either standard-property metadata, custom-property
identity, or `null`. `validateCssPropertyValue()` returns `valid`, `invalid`, or
`unsupported`; unsupported results identify grammar areas that cannot be decided
without application context. Both use the repository's pinned WebRef data.

Selector APIs are documented separately in [Selector matching](./selectors.md).
