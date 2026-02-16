# Evaluation report format

Primary report artifacts:
- `reports/gates.json`
- `reports/score.json`
- `reports/eval-summary.json`
- `reports/eval-report.md`

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
- `reports/browser-diff.json`
- `reports/fuzz.json`
- `reports/bench.json`

`reports/selectors.json` shape:
- `suite`: `"selectors"`
- `timestamp`: ISO string
- `checks`: export/docs/fixtures/tests/cases/strictMode/budget checks
- `overall.ok`: boolean
- `failures`: array with failed check summaries
