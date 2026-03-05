# Extract Render Signals

Goal: derive deterministic rendering-oriented metadata from parsed CSS.

```ts
import { extractRenderSignals, parse } from "@ismail-elkorchi/css-parser";

const tree = parse(".card { color: red; background: white; }");
const signals = extractRenderSignals(tree);

console.log(Array.isArray(signals));
```

Expected output:
- Stable signal extraction for downstream tooling.
