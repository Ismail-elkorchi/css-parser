# Parsing, Diagnostics, and Budgets

## Entrypoints

- `parse(css, options?)` parses a stylesheet.
- `parseBytes(bytes, options?)` detects the CSS encoding and parses bytes.
- `parseStream(stream, options?)` decodes a byte stream incrementally, then parses the complete decoded stylesheet.
- `parseFragment(css, context, options?)` parses one of the supported CSS contexts.
- `parseRuleList(css, options?)` parses a rule list.
- `parseDeclarationList(css, options?)` parses inline declaration text.
- `tokenize(css, options?)` returns the token sequence.
- `tokenizeStream(stream, options?)` decodes the complete stream and yields its tokens.

Supported fragment contexts are `stylesheet`, `atrule`, `atrulePrelude`, `mediaQueryList`, `mediaQuery`, `condition`, `rule`, `selectorList`, `selector`, `block`, `declarationList`, `declaration`, and `value`.

## Diagnostics

Recoverable parser diagnostics are returned in `tree.errors`. Each error includes a stable `parseErrorId`, a message, and location information when available. `getParseErrorSpecRef()` returns the CSS Syntax error-handling section associated with parser diagnostics.

Budget failures throw `BudgetExceededError`. Patch-planning failures throw `PatchPlanningError`.

## Options

`ParseOptions` supports:

- `captureSpans`: retain input offsets on nodes.
- `trace`: include decode, token, parse, diagnostic, budget, and stream events.
- `transportEncodingLabel`: provide an HTTP or transport encoding hint for byte input.
- `budgets`: bound resource use.

Available budgets are:

- `maxInputBytes`
- `maxBufferedBytes`
- `maxTokens`
- `maxNodes`
- `maxDepth`
- `maxTraceEvents`
- `maxTraceBytes`
- `maxTimeMs`

`maxBufferedBytes` limits undecided encoding bytes and individual decoded stream chunks; it does not mean the parser builds a tree before EOF. Set `maxInputBytes` to bound the complete stylesheet.

## Encoding

Byte APIs apply CSS encoding precedence: BOM, transport label, `@charset`, then UTF-8. Text APIs accept an already-decoded JavaScript string.
