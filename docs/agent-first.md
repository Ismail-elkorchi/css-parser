# Agent-first completeness

Agent-first behavior is measured as observable runtime and evaluation outcomes.

## Checklist
- Deterministic identifiers for parsed nodes.
- Bounded trace with deterministic event ordering.
- Span coverage for patch planning when `captureSpans: true`.
- Deterministic outline and chunk output.
- Structured budget failures via `BudgetExceededError`.
- Deterministic parse error taxonomy with stable spec references.
- Deterministic selector matching for structured extraction workflows.
- Deterministic style-signal extraction with explicit selector support and cascade-order metadata.
- Deterministic render-signal extraction (`extractRenderSignals`, `extractInlineRenderSignals`) for non-layout visibility/control reasoning.

## Verification surface
- `reports/agent.json`
- `reports/selectors.json`
- `reports/stream.json`
- `realworld/reports/css-render-signals-v2.json`
- `reports/determinism.json`
- `reports/budgets.json`
- `reports/gates.json`
