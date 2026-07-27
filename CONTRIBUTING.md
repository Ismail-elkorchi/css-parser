# Contributing

Bug fixes and focused maintenance changes can go directly to a pull request. Open an issue before investing in a substantial API or parser-behavior redesign.

Keep runtime code ESM-only, portable, and free of installed dependencies. Public breaking changes are acceptable before 1.0 when they remove ambiguity or defects; do not add compatibility layers for obsolete contracts.

Run:

```sh
npm ci
npm run check:fast
```

Parser, package, or runtime changes also require:

```sh
npx playwright install chromium
npm run qualification:ci
```

Add the smallest regression test that fails without the change. Behavior tests belong in `test/`, fixed inputs in `test/fixtures/`, and generated evidence in the ignored `reports/` directory.

See [development and releases](./docs/development.md) for the repository layout and qualification profiles.
