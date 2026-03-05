# Contributing

## Local verification
- Runtime dependencies in `package.json` must stay empty.
- Runtime code under `src/` must not import Node builtin modules.
- Public API behavior changes must update `docs/reference/api-overview.md`.

Run before proposing changes:
```bash
npm ci
npm run lint
npm run typecheck
npm run build
npm test
npm run eval:ci
```

## Naming policy
- Use domain-first names and explicit reference frames.
- Use truth-conditional booleans (`is*`, `has*`, `can*`).
- Avoid uppercase log prefixes like `CUE:`, `ACT:`, `EVAL:`.

## Documentation policy
- Keep documentation aligned with code behavior.
- Keep reference pages aligned with exported APIs and options.
- Keep third-party attributions complete in `THIRD_PARTY_NOTICES.md`.

## Maintainer docs

- [Maintainer index](./docs/maintainers/index.md)
