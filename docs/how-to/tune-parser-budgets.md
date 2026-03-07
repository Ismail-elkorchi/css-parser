# Tune Parser Budgets

## Goal
Size CSS parser budgets so oversized or adversarial stylesheets fail in a
predictable way instead of forcing downstream tools to guess.

## Prerequisites
- `@ismail-elkorchi/css-parser` installed
- A representative large stylesheet sample

## Copy/paste
```ts
import { BudgetExceededError, parse } from "@ismail-elkorchi/css-parser";

const css = ".box{display:block;}".repeat(10_000);

function run(maxTokens: number) {
  try {
    parse(css, {
      budgets: {
        maxInputBytes: 512_000,
        maxTokens,
        maxNodes: 10_000,
        maxDepth: 64,
        maxTimeMs: 250
      }
    });
    console.log(`maxTokens=${maxTokens}: ok`);
  } catch (error) {
    if (error instanceof BudgetExceededError) {
      console.log(`maxTokens=${maxTokens}: ${error.payload.code} ${error.payload.budget}`);
      return;
    }
    throw error;
  }
}

run(2_000);
run(50_000);
```

## Expected output
```txt
maxTokens=2000: BUDGET_EXCEEDED maxTokens
maxTokens=50000: ok
```

## Common failure modes
- `maxTokens` is tuned for small fixtures instead of real concatenated
  stylesheets.
- `maxBufferedBytes` is ignored for stream parsing paths, which removes a
  necessary bound on long-lived inputs.
- `maxTimeMs` is left unset for untrusted network or user-uploaded CSS.

## Related reference
- [Options](../reference/options.md)
- [Error model](../reference/error-model.md)
- [Performance characteristics](../explanation/performance-characteristics.md)
