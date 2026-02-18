# ADR-009: performance stability evidence gate

Status: Accepted

Date: 2026-02-16

## Context
- Release scoring used a single benchmark run, which produced score drift across repeated executions on the same host.
- Single-run evidence allowed transient runtime noise to change release totals.
- The project requires deterministic and reviewable release evidence.

## Decision
- Add release and hard-gate profile policy:
  - `requireBenchStability: true`
  - `benchStabilityRuns: 5`
- Keep CI profile fast:
  - `requireBenchStability: false`
- Add `reports/bench-stability.json` as release/hard-gate performance evidence.
- Each stability run performs one warm-up benchmark pass before measuring to reduce JIT cold-start bias.
- Use benchmark medians from `reports/bench-stability.json` for release/hard-gate performance scoring.
- Add gate `G-120 Benchmark stability gate` with hard thresholds:
  - throughput spread fraction (`(max-min)/median`) `<= 0.15`
  - memory spread fraction (`(max-min)/median`) `<= 0.05`
  - run count `>= 5`

## Consequences
- Release performance score depends on multi-run evidence instead of a single run.
- Release evaluation fails when benchmark variance is high even if average throughput is strong.
- CI speed remains unchanged while release confidence increases.
