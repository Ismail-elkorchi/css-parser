# Development

## Repository layout

- `src/public/` composes the published API and public-only operations.
- `src/internal/syntax/` contains input, encoding, tokenization, parsing,
  resource accounting, and serialization.
- `src/internal/selectors/` contains selector parsing, specificity, and
  matching.
- `src/internal/cssom/`, `properties/`, and `grammar/` contain declaration and
  property semantics.
- `src/internal/generated/` contains reproducible data generated from the pinned
  WebRef package.
- `test/` contains focused public, syntax, selector, CSSOM, and qualification
  tests.
- `scripts/` contains generation, direct qualification, build, smoke, and
  release-integrity tooling.
- `examples/` contains runnable public API examples.

Generated `dist/` and `reports/` files are not committed.

## Verify a change

Node.js 20 or newer, npm 10 or newer, and Deno are sufficient for the fast
checks:

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

Regenerate the pinned CSS property and selector catalog with
`npm run generate:css-data`. `npm run generate:check` downloads the exact
registry artifact, verifies its integrity, and rejects stale generated output.

## Release

Update the changelog and set the same version in `package.json`,
`package-lock.json`, and `jsr.json`. Run release qualification before merging
the version change. Tag the exact qualified `main` commit and create the GitHub
release; the release workflow verifies tag and manifest parity before publishing
to npm and JSR.
