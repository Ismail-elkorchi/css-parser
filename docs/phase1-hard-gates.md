# Phase 1 hard-gate build

Phase 1 is complete only when `npm run eval:hard-gate` exits with code `0`.

Evidence report:
- `reports/hard-gate.json`

Hard-gate checks are strict and falsifiable:
- tokenizer/tree/encoding/serializer reports must be non-vacuous and strict:
  - minimum total case surface
  - `failed = 0`
  - `skipped = 0`
  - holdout rule exactly `hash(id) % 10 === 0`
  - holdout modulus exactly `10`
  - holdout excluded fraction in `[0.05, 0.15]`
- determinism report must include at least two passing cases with `sha256:<64-hex>` hash shape.
- stream report must include:
  - `stream-equivalent-to-bytes` passing
  - `stream-max-input-bytes-aborts` passing
- agent report must include passing features:
  - `trace`, `spans`, `patch`, `outline`, `chunk`, `streamToken`, `parseErrorId`, `selectors`
- smoke report must include passing runtime checks (`parse`, `serialize`, `parseBytes`, `parseFragment`, `parseStream`, `tokenize`) for:
  - `node`
  - `deno`
  - `bun`
- release evidence checks:
  - browser-diff min cases, min agreement, min engines, min tag coverage
  - fuzz minimum run volume with zero crashes and zero hangs
  - benchmark coverage for `parse-medium` and `parse-large` with positive metrics
- packaging and docs checks:
  - `reports/pack.json.ok = true`
  - `reports/pack.json.thirdPartyNoticesIncluded = true`
  - `reports/docs.json.ok = true`
