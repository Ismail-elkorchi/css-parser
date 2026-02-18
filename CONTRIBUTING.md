# Contributing

Policy reference marker: LOG_LABEL_POLICY=DOMAIN_PHRASES_NO_TAG_PREFIX (canonical: docs/naming-conventions.md)

## Development baseline
- Runtime dependencies in `package.json` must stay empty.
- Runtime code under `src/` must not import Node builtin modules.
- Public API behavior changes must update `docs/spec.md`.

## Required checks before proposing changes
```bash
npm ci
npm run lint
npm run typecheck
npm run build
npm test
npm run eval:ci
```

## Decision record policy
- Fixture skips require ADR-001.
- Threshold and gate changes require ADR-002.
- Oracle and normalization changes require ADR-003.
- Dataset updates require ADR-004.
- Dev dependency additions require ADR-005 and `docs/debt.md` update.

## Documentation policy
- Keep documentation aligned with code behavior.
- Keep `docs/spec-snapshots.md` aligned with vendored spec snapshots.
- Keep third-party attributions complete in `docs/third-party.md` and `THIRD_PARTY_NOTICES.md`.
