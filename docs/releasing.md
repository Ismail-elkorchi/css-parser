# Releasing (alpha policy)

This repository does not publish automatically.
Release execution is manual and only occurs after `eval:release` passes.

## Package identity
- Intended public npm package name: `@ismail-elkorchi/css-parser`
- Intended public JSR package name: `@ismail-elkorchi/css-parser`
- Versioning policy: `0.x` while hardening is active.

## Local release verification
```bash
npm ci
npm run lint
npm run typecheck
npm run build
npm test
npm run eval:ci
npm run eval:release
```
