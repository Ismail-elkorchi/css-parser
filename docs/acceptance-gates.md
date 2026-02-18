# Acceptance gates (definition of “best”)

This document is the operational definition of quality for this CSS parser.
A release qualifies only if it passes all gates in the active profile and then achieves the highest composite score under `evaluation.config.json`.

Profiles:
- `ci`: day-to-day enforcement
- `release`: release enforcement

## Gate set
- `G-000`: Evaluation configuration exists.
- `G-010`: Zero runtime dependencies.
- `G-012`: No external imports in `dist/`.
- `G-015`: Runtime self-contained install and smoke.
- `G-020`: ESM only packaging.
- `G-030`: No Node builtin imports in `src/`.
- `G-040`: Conformance tokenizer (holdout discipline enforced).
- `G-050`: Conformance parser/tree (holdout discipline enforced).
- `G-060`: Conformance encoding (holdout discipline enforced).
- `G-070`: Conformance serializer (holdout discipline enforced).
- `G-080`: Determinism report must pass.
- `G-085`: Streaming invariants report must pass.
- `G-086`: Agent feature report must pass.
- `G-088`: Parse-error taxonomy contract must pass.
- `G-090`: Parse-context API contract must pass.
- `G-091`: Selector contract and fixtures must pass.
- `G-100`: Runtime smoke matrix gates.
- `G-110`: Browser differential parity gate.

## Holdout discipline
For each conformance suite:
- `executedSurface = passed + failed`
- `totalSurface = passed + failed + skipped + holdoutExcluded`
- `holdoutExcludedFraction = holdoutExcluded / totalSurface`
- `holdoutExcludedFraction` must be in `[0.05, 0.15]`
- `holdoutRule` and `holdoutMod` must be present in the report
