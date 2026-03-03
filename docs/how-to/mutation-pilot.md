# Mutation Pilot (Advisory)

This document describes the first mutation-testing pilot for `css-parser`.

## Scope

Pilot target:
- `dist/internal/encoding/sniff.js`

Pilot exclusions:
- browser-oracle integration paths
- realworld corpus and selector benchmark pipelines
- release workflow logic

Why this scope:
- Encoding resolution affects parser correctness before tokenization.
- The module is deterministic and easy to exercise with focused control tests.
- The pilot remains bounded and non-blocking.

## Commands

```bash
npm run mutation:pilot
```

The pilot command builds once, applies configured mutants, and runs focused control tests:
- config: `scripts/mutation/pilot-config.json`
- output: `docs/reference/mutation-pilot-report.json`

## Baseline and hardening delta

Baseline snapshot (before hardening tests):
- report: `docs/reference/mutation-pilot-report-baseline.json`
- result: `killed=1`, `survived=3`, `total=4`

Survivors identified in baseline:
- `alias-windows1252`
- `transport-precedence`
- `charset-rule-disabled`

Hardening changes introduced in this pilot:
- added `latin-1` alias assertion for `@charset`
- added transport precedence assertion over `@charset`
- added direct `@charset` resolution assertion without higher-precedence signals

Final pilot result after hardening:
- report: `docs/reference/mutation-pilot-report.json`
- result: `killed=4`, `survived=0`, `total=4`

## Residual risk

This pilot is advisory and narrow by design.
Mutation results do not replace release and hard-gate validation (`npm run eval:release`, `npm run eval:hard-gate`).
