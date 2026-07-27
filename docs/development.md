# Development and Releases

## Layout

- `src/public/` defines the published API and types.
- `src/internal/` contains encoding, tokenizer, tree, serializer, and the typed CSSTree facade.
- `src/internal/vendor/csstree/` is the only embedded runtime implementation.
- `test/` contains behavior tests and fixed selector fixtures.
- `scripts/qualification/` contains direct fuzz, runtime, browser, performance, and package checks.
- `scripts/smoke/` contains runnable runtime entrypoint checks.
- `examples/` contains public API examples.

Generated `dist/` and `reports/` files are not committed.

## Verify a change

Node.js 20 or newer, npm 10 or newer, and Deno are sufficient for the fast checks:

```sh
npm ci
npm run check:fast
```

Full CI qualification also requires Bun and Chromium:

```sh
npx playwright install chromium
npm run qualification:ci
```

Release qualification requires Chromium, Firefox, and WebKit:

```sh
npx playwright install chromium firefox webkit
npm run qualification:release
```

The release profile adds a CSSOM differential; it does not replace focused regression tests.

## Release

Set the same version in `package.json`, `package-lock.json`, and `jsr.json`, update `CHANGELOG.md`, and run release qualification. After the release change is merged, tag that exact `main` commit and create a GitHub release. The release event publishes the qualified source to npm and JSR.
