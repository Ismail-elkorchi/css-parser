# Changelog

All notable changes are documented in this file.

## Unreleased

- Consolidate verification around direct behavior, runtime, browser, fuzz, performance, and packed-consumer checks.
- Remove generated scoring, research, mutation-pilot, HTML fixture, and duplicate policy infrastructure.
- Make the npm and JSR entrypoints expose the same public TypeScript contract.
- Remove unused parse5/entities runtime files, submodules, and specification snapshots.
- Simplify the documentation and contributor path around the current package.
- Require canonical `ParseContext` values in `parseFragment()` and remove the redundant `ParseOptions.context` and `includeSpans` aliases.
- Remove the unused argument from `getParseErrorSpecRef()`.

## [0.1.1] - 2026-03-04
- Add OIDC `publish.yml` workflow for npm Trusted Publishing and JSR publish on release events.
- Add publish manifest evidence and deterministic tag/version parity checks before publish.
- Add a documentation index and runnable examples.

## [0.1.0] - 2026-03-04
- First public release of `@ismail-elkorchi/css-parser`.
- npm + JSR package metadata, docs surface, and release automation hardened for deterministic publishing.
