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
- `reports/bench-stability.json` (release/hard-gate)

`reports/bench.json` shape:
- `suite`: `"bench"`
- `timestamp`: ISO string
- `benchmarks[]` entries include:
  - `name`
  - `inputBytes`
  - `iterations`
  - `elapsedMs`
  - `mbPerSec`
  - `memoryMB` (scoring input)
  - `memoryBaselineMB`
  - `memoryPeakMB`
  - `memoryRetainedMB`
  - `memoryMethod` (`postGcHeapUsed`)

`reports/bench-stability.json` shape:
- `suite`: `"bench-stability"`
- `timestamp`: ISO string
- `runs`: number
- `warmupsPerRun`: number
- `runIsolation`: `"subprocess-per-run"`
- `benchmarks.<name>.mbPerSec`:
  - `values[]`
  - `min`
  - `max`
  - `median`
  - `p10`
  - `p90`
  - `spreadFraction`
  - `robustSpreadFraction`
- `benchmarks.<name>.memoryMB`:
  - `values[]`
  - `min`
  - `max`
  - `median`
  - `p10`
  - `p90`
  - `spreadFraction`
  - `robustSpreadFraction`

Performance scoring source:
- `ci`: `reports/bench.json`
- `release`/`hard-gate`: `reports/bench-stability.json` medians

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

`reports/score.json` shape:
- `suite`: `"score"`
- `timestamp`: ISO string
- `profile`: `ci` | `release` | `hard-gate`
- `weightsUsed`:
  - `source`: which weight set was applied (`profiles.<profile>.weights` or `weights`)
  - `values`: resolved numeric category weights
  - `total`: must equal `100`
- `total`: numeric score out of `100`
- `breakdown.<category>.score`: numeric score contribution
- `breakdown.<category>.details`: scoring inputs

Score interpretation rules:
- Categories with weight `0` contribute `0` points and are not evidence-required for score.
- Categories with weight `> 0` must align with profile-required evidence policy (`G-128`).

`reports/gates.json` additions:
- Gate `G-128` (`Score model coherence`) includes:
  - `weights`: resolved profile weights
  - `checks[]`: `{ category, weight, policyField, pass, ... }`
