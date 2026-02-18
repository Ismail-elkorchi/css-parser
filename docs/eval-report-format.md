# Evaluation report format

Primary report artifacts:
- `reports/gates.json`
- `reports/score.json`
- `reports/eval-summary.json`
- `reports/eval-report.md`
- `reports/hard-gate.json`

Conformance reports:
- `reports/tokenizer.json`
- `reports/tree.json`
- `reports/encoding.json`
- `reports/serializer.json`
- `reports/holdout.json`

Runtime quality reports:
- `reports/determinism.json`
- `reports/budgets.json`
- `reports/stream.json`
- `reports/agent.json`
- `reports/selectors.json`
- `reports/smoke.json`
- `reports/browser-diff.json`
- `reports/fuzz.json`
- `reports/bench.json`

`reports/hard-gate.json` shape:
- `suite`: `"hard-gate"`
- `timestamp`: ISO string
- `profile`: `ci` | `release` | `hard-gate`
- `overall.ok`: boolean
- `overall.failedChecks`: string[]
- `checks[]`: `{ id, ok, details }`

`reports/smoke.json` shape:
- `suite`: `"smoke"`
- `timestamp`: ISO string
- `runtimes.node|deno|bun`: smoke-runtime report objects
  - includes `ok`, `version`, `determinismHash`, `determinismFixtureId`, `checks`
- `determinism`: `{ ok, allRuntimeHashesPresent, hashes }`
- `overall.ok`: boolean

`reports/selectors.json` shape:
- `suite`: `"selectors"`
- `timestamp`: ISO string
- `checks`: export/docs/fixtures/tests/cases/strictMode/budget checks
- `overall.ok`: boolean
- `failures`: array with failed check summaries
