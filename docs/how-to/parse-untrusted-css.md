# Parse Untrusted CSS Safely

Goal: parse unknown CSS with explicit limits.

```ts
import { BudgetExceededError, parse } from "@ismail-elkorchi/css-parser";

const css = "a{}".repeat(25_000);

try {
  const tree = parse(css, {
    budgets: {
      maxInputBytes: 64_000,
      maxNodes: 5_000,
      maxDepth: 128
    }
  });

  console.log(tree.kind);
} catch (error) {
  if (error instanceof BudgetExceededError) {
    console.log(error.payload.code, error.payload.budget);
  } else {
    throw error;
  }
}
```

Expected output:
- Deterministic parse success or a structured budget failure.
