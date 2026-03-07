# Parsing Is Not Policy Or Sanitization

## Goal
Separate structural CSS parsing from content-policy decisions such as
allow-lists, deny-lists, or sanitization.

## Prerequisites
- `@ismail-elkorchi/css-parser` installed
- A separate CSS policy layer if untrusted styles can reach rendering paths

## Copy/paste
```ts
import { parse } from "@ismail-elkorchi/css-parser";

const stylesheet = `
  .promo { background-image: url(https://example.com/tracker.png); }
  .promo { position: fixed; inset: 0; }
`;

const tree = parse(stylesheet);

console.log(tree.kind);
console.log(tree.errors.length);
console.log(tree.children.length > 0);
```

## Expected output
```txt
stylesheet
0
true
```

## Common failure modes
- Unsafe assumption: a stylesheet that parsed without errors is safe to apply.
- Policy drift: URL restrictions, property allow-lists, and selector bans are
  left to ad-hoc string checks after parsing.
- Treating selector compilation as a security boundary; it only models matching
  behavior.

## Related reference
- [Security posture](../explanation/security-posture.md)
- [Options](../reference/options.md)
- [Selector behavior](../reference/selectors.md)
