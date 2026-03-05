# Error Model

## `BudgetExceededError`

Thrown when resource budgets are exceeded.

Payload fields:
- `code`: `"BUDGET_EXCEEDED"`
- `budget`: exceeded key
- `limit`: configured upper bound
- `actual`: observed value

## `PatchPlanningError`

Thrown when deterministic patch planning cannot apply a requested edit.

Payload fields:
- `code`: machine-readable reason
- `target`: optional node id tied to the failure

## Parse errors

Parse APIs return parse errors with stable `parseErrorId` values.
Use `getParseErrorSpecRef(parseErrorId)` to resolve spec references.
