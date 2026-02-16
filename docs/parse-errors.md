# Parse errors

Parse errors are normalized into deterministic `parseErrorId` values.

Contract:
- `parse(...).errors[*].parseErrorId` is stable for equal input/options.
- `getParseErrorSpecRef(parseErrorId)` returns:
  - `https://drafts.csswg.org/css-syntax/#error-handling`
