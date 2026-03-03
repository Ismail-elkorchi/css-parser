# Release and Hard-gate Validation

Run this sequence before release/publish decisions.

## Required checks

```bash
npm run lint
npm run typecheck
npm run build
npm run examples:run
npm run eval:ci
npm run eval:release
npm run eval:hard-gate
```

## Realworld evidence refresh

```bash
npm run eval:realworld
```

This command updates tracked proof artifacts in:
- `realworld/reports/**`
- `realworld/manifests/**`

## Packaging dry-run

```bash
npm pack --dry-run
npm publish --dry-run
jsr publish --dry-run
```

## Falsification probe

Run one independent canary parse+selector check in a clean workspace before final sign-off.
