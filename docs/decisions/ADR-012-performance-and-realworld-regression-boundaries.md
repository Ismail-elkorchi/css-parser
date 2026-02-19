# ADR-012: tighten performance and realworld regression boundaries

Status: Accepted

Date: 2026-02-19

Supersedes: ADR-010 (threshold values only)

## Context
- After `perf(core): optimize AST annotation hotpath`, release performance scoring stayed above parity in repeated runs.
- Evidence from three consecutive release runs on the same host showed:
  - total score: `100/100` on all runs
  - performance ratio: `1.0453`, `1.0493`, `1.0425`
  - throughput median ratios remained above `1.05` for `parse-medium` and `parse-large`.
- Realworld selector and parse checks also showed large margins relative to prior thresholds.

## Decision
- Tighten `G-120` configuration thresholds in `evaluation.config.json`:
  - `maxThroughputRobustSpreadFraction`: `0.45` -> `0.30`
  - `maxMemoryRobustSpreadFraction`: `0.02` -> `0.01`
  - `minThroughputMedianRatio`: `0.80` -> `0.95`
  - `maxMemoryMedianRatio`: `1.05` -> `1.03`
- Tighten `realworld/targets.json` selector and parse thresholds:
  - parse timing maxima reduced (`p95`, `p99`, `max`)
  - selector QPS minima raised (single-run and stability medians)
  - selector spread maxima reduced
  - selector retained-memory maxima reduced

## Consequences
- Regression detection becomes stricter for both core parser throughput and realworld selector workloads.
- The new thresholds remain evidence-backed rather than aspirational.
- Future regressions will fail earlier instead of being absorbed by wide threshold margins.
