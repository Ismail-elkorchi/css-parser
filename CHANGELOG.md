# Changelog

All notable changes are documented in this file.

## [0.2.7] - 2026-09-01

- Add bounded component-value tree cloning for semantic transformations that
  insert one parsed value more than once, with fresh tree-local structural IDs,
  cycle rejection, cancellation, and resource limits.

## [0.2.6] - 2026-09-01

- Compile selector lists directly from retained parser component-value trees,
  preserving source spans and selector resource accounting without another
  serialization and tokenization pass.
- Accept surrounding whitespace around top-level and nested selector-list
  branches as required by the selector grammar.
- Add a retained-prelude compilation performance control.

## [0.2.5] - 2026-09-01

- Join ordered selector candidates directly by stored document ordinals,
  including k-way selector-list unions, intersections, HTML/foreign-content
  name joins, and environment-supplied pseudo-class candidates, without
  rescanning the complete document.
- Add bounded property-validation sessions for already parsed component-value
  trees, with structural cache keys and explicit retention statistics.
- Add 100,000-element candidate-join and repeated parsed-value validation
  performance controls.

## [0.2.4] - 2026-08-30

- Short-circuit selector lists, logical pseudo-class alternatives, relative
  selector candidates, and ancestor relationships after a definite match.
- Narrow selector queries through attribute-name and document-root candidate
  indexes, dynamic pseudo-class candidates, compound intersections, and
  document-order subtree joins while preserving namespaces, HTML casing,
  three-valued matching, resource accounting, and deterministic order.

## [0.2.3] - 2026-08-30

- Add explicit reusable selector match sessions that validate and index an
  immutable caller-owned tree once for related selector operations.
- Narrow selector queries through document-order element-name, ID, and class
  candidate indexes while preserving three-valued matching, resource usage,
  cancellation, namespaces, and quirks-mode behavior.

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
