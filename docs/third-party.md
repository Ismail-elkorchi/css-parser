# Third-party datasets and fixtures

Record all vendored datasets and fixtures here.

## CSSWG editor draft snapshots
Source:
- https://drafts.csswg.org/
Pinned version:
- Local snapshots in `vendor/specs/csswg-drafts/*.html`
Fetch date:
- `2026-02-16`
License:
- W3C Document License / CSSWG publication terms per individual draft.
Attribution notes:
- Snapshots are used for parser-policy reference and spec pinning.

## Web Platform Tests (WPT)
Source:
- https://github.com/web-platform-tests/wpt
Pinned version:
- `79918eac4ec1230dd458d8e2e0f6b3981b4937ea`
Fetch date:
- `2026-02-16`
License:
- WPT repository license (see upstream repository).
Attribution notes:
- Sparse checkout under `vendor/wpt` for CSS parser-relevant directories.

## CSSTree runtime source (vendored)
Source:
- https://github.com/csstree/csstree
Pinned version:
- `css-tree@3.1.0`
Fetch date:
- `2026-02-16`
License:
- MIT (`src/internal/vendor/csstree/LICENSE`)
Attribution notes:
- Vendored ESM runtime under `src/internal/vendor/csstree/csstree.esm.js`.
- Used to implement parser/tokenizer/generator behavior without runtime dependencies.
