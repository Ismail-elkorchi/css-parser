# ADR-011: CI score model coherence with produced evidence

Status: Accepted

Date: 2026-02-19

## Context
- `eval:ci` did not execute release-only evidence steps (`bench-stability`, browser differential, fuzz).
- CI profile scoring still assigned non-zero weight to performance, which created score penalties unrelated to CI-required evidence.
- A non-100 CI score with all CI gates passing reduces signal quality for maintainers and automation.

## Decision
- Keep profile-weighted scoring and set CI weights to evidence produced in CI:
  - `correctness`: 70
  - `browserDiff`: 0
  - `performance`: 0
  - `robustness`: 10
  - `agentFirst`: 15
  - `packagingTrust`: 5
- Add explicit score-policy fields in profile config:
  - `requireConformanceReports`
  - `requireAgentReport`
  - `requirePackReport`
  - `requireDocsReport`
  - `requireBudgetsReport`
  - `requireBenchReport`
  - `robustnessUsesFuzz`
- Add gate `G-128` (`Score model coherence`) in `scripts/eval/check-gates.mjs`:
  - if category weight `> 0`, corresponding evidence policy must be enabled
  - if category weight `= 0`, category does not affect score

## Consequences
- `eval:ci` score reflects CI-measured reality.
- Score regressions in CI now indicate CI-surface quality issues, not missing release-only artifacts.
- Release and hard-gate scoring remain unchanged and continue to require performance/browser evidence.
