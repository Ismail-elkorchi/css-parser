# Changelog

All notable changes are documented in this file.

## [0.2.2] - 2026-08-27

- Validate CSS Grid line-name groups as structured square-block component
  values, including repeated groups in fixed and auto-repeat track lists.
- Reject CSS-wide keywords, commas, and non-ident components where the Grid
  grammar requires custom identifiers.

## [0.2.1] - 2026-08-26

- Validate `calc()`, `min()`, `max()`, and `clamp()` through typed numeric
  dimensional analysis, including mixed length-percentage expressions.
- Reject incompatible addition, nonnumeric divisors, and products of two
  dimensional values while retaining typed unsupported outcomes for math
  functions outside the implemented validation slice.

## [0.2.0] - 2026-07-29

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
