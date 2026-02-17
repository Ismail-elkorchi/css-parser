# ADR-010: G-120 robust stability thresholds with isolated runs

Status: Accepted

Date: 2026-02-17

Supersedes: ADR-009 (threshold calculation details)

## Context
- `G-120` produced frequent false negatives on shared developer hosts when stability was measured with `(max-min)/median`.
- Single-process benchmark loops amplified cross-run interference and JIT phase effects.
- The project still needs hard regression detection, not a weaker gate.

## Decision
- Keep `G-120` mandatory for release and hard-gate profiles.
- Increase `benchStabilityRuns` from 5 to 9.
- Measure each run in an isolated subprocess (`runIsolation: "subprocess-per-run"`), with warmup runs before each measured run.
- Use robust spread for gating:
  - throughput robust spread fraction: `(p90-p10)/median`
  - memory robust spread fraction: `(p90-p10)/median`
- Add baseline-ratio checks to preserve regression detection strength:
  - throughput median ratio vs baseline `>= 0.80`
  - memory median ratio vs baseline `<= 1.05`
- Keep medians as the scoring input for release/hard-gate performance points.

## Consequences
- False negatives from transient host contention are reduced.
- Real regressions still fail because medians must stay near baseline and robust spread remains bounded.
- Bench stability report schema is expanded with `p10`, `p90`, and `robustSpreadFraction`.
