# Style and Render Signals

`extractStyleRuleSignals()` returns selector, specificity, cascade order, and declaration metadata for stylesheet rules. `extractInlineStyleSignals()` returns ordered declarations from inline style text.

`extractRenderSignals()` and `extractInlineRenderSignals()` classify declarations that affect:

- visibility,
- layout suppression,
- text presentation,
- control affordances when enabled.

These helpers expose syntax-level evidence for downstream tools. They do not compute the cascade, inheritance, media-query truth, layout, or browser rendering. Treat them as inputs to a higher-level model, not as a visibility or security verdict.

By default, style-rule extraction omits selectors outside the supported matching subset. Use `includeUnsupportedSelectors` to retain them or `strictSelectors` to reject them.
