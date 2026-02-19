# ADR-006: selector contract gate and fixture-backed evidence

- Status: accepted
- Date: 2026-02-16
- Decision type: gate and API contract hardening

## Context
Hard-gate set requires falsifiable evidence for selector behavior, not narrative claims.
The repository had selector implementation work-in-progress but no dedicated eval artifact and no gate requiring selector fixtures.

## Decision
Add a selector contract and gate with these requirements:
- Public API exports exist: `compileSelectorList`, `matchesSelector`, `querySelectorAll`.
- Contract documentation exists at `docs/selectors.md`.
- Fixture suite exists at `test/fixtures/selectors/v1/cases.json` with deterministic expected outputs.
- Control tests exist at `test/control/selectors.test.js`.
- Eval step writes `reports/selectors.json` and `overall.ok` must be `true`.
- Gate `G-091` fails when selector artifact evidence is missing or failing.

## Consequences
- Selector behavior is mechanically verified in CI and release profiles.
- Unsupported selectors are explicit (`unsupportedParts`) and strict mode behavior is tested.
- Budget overflow behavior for selector traversal is verified with structured errors.
