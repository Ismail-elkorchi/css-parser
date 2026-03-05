# Design Constraints and Non-goals

## Constraints
- Deterministic parse and selector behavior comes first.
- Resource budgets are mandatory controls for untrusted input handling.
- Public APIs stay explicit so automation can audit output reliably.

## Non-goals
- Browser layout/cascade emulation.
- CSS sanitization policy enforcement.
- Script execution or DOM runtime behavior.
