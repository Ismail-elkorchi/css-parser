# Architecture and Tradeoffs

`css-parser` focuses on deterministic CSS parsing and selector workflows for automation systems.

## Core architecture
- Public API in `src/public/mod.ts` and `src/public/types.ts`.
- Internal tokenizer/parser/serializer/selectors under `src/internal/`.
- Runtime path has zero production dependencies.

## Design priorities
1. Deterministic parse and serialization output.
2. Bounded execution with explicit budgets.
3. Cross-runtime portability (Node, Deno, Bun, browser).
4. Evidence-backed release and hard-gate checks.

## Tradeoffs
- Not a browser style engine.
- Not a layout engine.
- Not a sanitizer.
- Strict hard-gate and realworld checks can increase preparation time, but they prevent low-signal releases.
