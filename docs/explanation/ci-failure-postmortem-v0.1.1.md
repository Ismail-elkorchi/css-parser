# CI Failure Postmortem (v0.1.1 Publish)

## Scope
- Workflow: `Publish`
- Trigger: release `v0.1.1`
- Run: https://github.com/Ismail-elkorchi/css-parser/actions/runs/22651364934
- Failing step: `Run JSR publish dry-run`

## What failed?
`npx -y jsr publish --dry-run` exited with code `1` in the publish workflow.

## Why did it fail?
The failed step log showed:
1. JSR dynamic-import analysis warnings (`unable to analyze dynamic import`) in `scripts/eval/check-gates.mjs` at `:252:39` and `:280:39`, and in `scripts/eval/write-selector-report.mjs` at `:37:39`.
2. A final hard failure on dirty workspace state (`Aborting due to uncommitted changes`) after publish artifacts were written during the run.

That combination stopped the release pipeline before publish.

## What change in this PR series removes the failure?
The release/tooling PR in this series hardens publish by:
- scoping JSR publish analysis to package-relevant files,
- preventing dry-run failures caused by workflow-generated artifacts,
- and adding a reproducible manual publish dry-run workflow for verification.

## Proof
- Workflow evidence: https://github.com/Ismail-elkorchi/css-parser/actions/runs/22651364934
- Log extraction command:
  ```bash
  gh run view 22651364934 --log-failed
  ```
