# ADR-008: cross-runtime determinism hash agreement gate

Status: Accepted

Date: 2026-02-16

## Context
- Smoke evidence previously confirmed feature execution but did not prove identical parse output across runtimes.
- Agent workflows require stable behavior across `node`, `deno`, and `bun`.
- Existing determinism report covered same-runtime repeatability only.

## Decision
- Extend smoke runtime reports with:
  - runtime version
  - deterministic fixture identifier
  - canonical parse hash (`sha256:<hex>`)
- Aggregate runtime smoke reports into `reports/smoke.json` with:
  - `determinism.ok`
  - per-runtime hash map
- Add gate `G-081 Cross-runtime determinism agreement` that requires:
  - required runtime hashes present (`node`, `deno`, `bun`)
  - all required runtime hashes are identical
- Keep existing determinism gates and thresholds unchanged; this is an additional strict check.

## Consequences
- Evaluation fails when runtime behavior diverges even if single-runtime tests pass.
- Smoke evidence becomes authoritative for runtime parity.
- Runtime command wiring must execute smoke under each real runtime.
