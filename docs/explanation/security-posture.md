# Security Posture

`css-parser` validates and structures CSS input; it is not a sanitizer.

Security posture:
- Explicit budgets to cap parser work.
- No script execution.
- No implicit network activity.

For untrusted input, combine parse budgets with separate content-policy checks.
