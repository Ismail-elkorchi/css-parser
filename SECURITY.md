# Security policy

## Supported versions

This project is in the active `0.x` line. Security fixes land on `main` and the latest `0.x` release.

## Reporting a vulnerability

Report vulnerabilities privately through GitHub Security Advisories:

`https://github.com/Ismail-elkorchi/css-parser/security/advisories/new`

Include:

- affected version or commit
- minimal reproduction input
- expected vs observed behavior
- impact assessment

## Security boundaries

- Parsing is not sanitization or policy enforcement.
- Untrusted input must run with explicit budgets.
- Budget limits are the primary protection against resource exhaustion.

## Budget guidance

Set and review at least:

- `maxInputBytes`
- `maxBufferedBytes`
- `maxTokens`
- `maxNodes`
- `maxDepth`
- `maxSteps`

Parsing beyond a configured limit throws `SyntaxResourceError` with the limit,
configured value, and observed value. Use an `AbortSignal` for external
cancellation.

## Verification

```bash
npm run check:fast
npm run qualification:ci
```
