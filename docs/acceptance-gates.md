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
- `G-081`: Cross-runtime determinism hash agreement (`node`/`deno`/`bun`).
- `G-085`: Streaming invariants report must pass.
- `G-086`: Agent feature report must pass.
- `G-088`: Parse-error taxonomy contract must pass.
- `G-090`: Parse-context API contract must pass.
- `G-091`: Selector contract and fixtures must pass.
- `G-100`: Runtime smoke matrix gates.
- `G-110`: Browser differential parity gate.
- `G-115`: Hard-gate evidence integrity report.
- `G-120`: Benchmark stability gate (release and hard-gate profiles).

## Performance evidence policy
- `ci` score uses single-run `reports/bench.json` when performance weight is non-zero.
- `release` and `hard-gate` scores use `reports/bench-stability.json` medians.
- `G-120` requires benchmark robustness bounds on `parse-medium` and `parse-large`:
  - throughput robust spread fraction (`(p90-p10)/median`) `<= 0.45`
  - memory robust spread fraction (`(p90-p10)/median`) `<= 0.02`
  - throughput median ratio vs baseline `>= 0.80`
  - memory median ratio vs baseline `<= 1.05`
  - run count `>= 9`
  - each measured run executes in an isolated subprocess after warmups

## Holdout discipline
For each conformance suite:
- `executedSurface = passed + failed`
- `totalSurface = passed + failed + skipped + holdoutExcluded`
- `holdoutExcludedFraction = holdoutExcluded / totalSurface`
- `holdoutExcludedFraction` must be in `[0.05, 0.15]`
- `holdoutRule` and `holdoutMod` must be present in the report

## Hard-gate profile
Command:
- `npm run eval:hard-gate`

Hard-gate profile uses release requirements plus `G-115` strict evidence checks:
- non-vacuous conformance surface for tokenizer/tree/encoding/serializer
- deterministic hash shape checks in `reports/determinism.json`
- mandatory stream check IDs with pass status
- mandatory agent feature checks with pass status
- runtime smoke check matrix per runtime (`node`, `deno`, `bun`)
- cross-runtime determinism hash equality across `node`, `deno`, and `bun`
- release-only evidence checks:
  - browser-diff case/engine/agreement/tag-coverage checks
  - fuzz run volume and no crash/hang checks
  - benchmark coverage for `parse-medium` and `parse-large`
