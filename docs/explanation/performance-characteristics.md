# Performance Characteristics

The package prioritizes deterministic behavior and bounded work.

Characteristics:
- predictable parse flow with budget checks,
- stable selector query ordering,
- stream parsing with explicit buffer limits.

Benchmark commands:

```bash
npm run test:bench
npm run test:bench:stability
```
