# Anti-drift checklist

Start of stage:
- Read `docs/invariants.md`
- Re-state current stage objective in one sentence
- Identify the oracle and the report to be produced
- Identify budgets and determinism implications

End of stage:
- Run `npm run eval:ci`
- If any skip was added, create ADR-001
- If any threshold or gate changed, create ADR-002
- Update `docs/spec.md` if public behavior changed
