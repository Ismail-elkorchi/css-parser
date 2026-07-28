# Changelog

All notable changes are documented in this file.

## Unreleased

- Replace the embedded CSSTree runtime with the package's CSS Syntax
  implementation and remove all embedded runtime dependencies.
- Introduce discriminated syntax, diagnostic, resource, selector, property, and
  CSSOM declaration contracts shared by npm and JSR.
- Add standards-based byte and stream decoding, structural serialization,
  traversal, and source-preserving edit planning.
- Add pinned WebRef property grammars, CSSOM declaration semantics, and
  Selectors Level 4 parsing, specificity, and three-valued matching.
- Remove trace, outline, chunk, render-signal, implicit selector-cache, legacy
  adapter, and obsolete fixture surfaces.
- Consolidate qualification around public behavior, runtimes, browser
  differentials, fuzzing, performance, and clean packed consumers.

## [0.1.1] - 2026-03-04
- Add OIDC `publish.yml` workflow for npm Trusted Publishing and JSR publish on release events.
- Add publish manifest evidence and deterministic tag/version parity checks before publish.
- Add a documentation index and runnable examples.

## [0.1.0] - 2026-03-04
- First public release of `@ismail-elkorchi/css-parser`.
- npm + JSR package metadata, docs surface, and release automation hardened for deterministic publishing.
