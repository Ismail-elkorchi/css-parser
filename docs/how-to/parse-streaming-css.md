# Parse Streaming CSS Input

Goal: parse CSS bytes that arrive in chunks.

```ts
import { parseStream } from "@ismail-elkorchi/css-parser";

const stream = new ReadableStream({
  start(controller) {
    controller.enqueue(new TextEncoder().encode(".a{"));
    controller.enqueue(new TextEncoder().encode("display:block}"));
    controller.close();
  }
});

const tree = await parseStream(stream, {
  budgets: {
    maxInputBytes: 8_192,
    maxBufferedBytes: 512,
    maxNodes: 512
  }
});

console.log(tree.kind);
```

Expected output:
- Stable parse output independent of chunk boundaries.
