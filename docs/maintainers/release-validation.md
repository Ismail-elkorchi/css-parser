# Release Validation

Use this page for maintainer release checks and publish readiness.

## Publish model

Publishing is done by GitHub Actions OIDC workflows:
- `.github/workflows/publish.yml` for release-triggered publish.
- `.github/workflows/release.yml` for release automation.

## Verification commands

```bash
npm ci
npm run check:fast
npm run docs:lint:jsr
npm run docs:test:jsr
npm run examples:run
npm run eval:release
npm run eval:hard-gate
npm pack --dry-run
```

## Release note format

Release note bullets are rendered as:
- `[PR title] (#123)`

Author suffixes are intentionally excluded.
