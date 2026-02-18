# Update playbook (datasets and fixtures)

Goal:
Update pinned datasets/spec snapshots without drifting the meaning of “best”.

Procedure:
1. Create ADR-004 describing update scope and risk.
2. Update fixture and dataset pins:
   - `vendor/wpt` sparse checkout commit
   - `vendor/specs/csswg-drafts/*.html` snapshots
3. Update records:
   - `docs/spec-snapshots.md`
   - `docs/third-party.md`
   - `THIRD_PARTY_NOTICES.md` if source/license text changes
4. Run verification commands:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build`
   - `npm run test:control`
   - `npm run eval:ci`
   - `npm run eval:release`
5. If behavior changes:
   - add/update divergence records in `reports/triage/`
   - choose ADR-003 for oracle/normalization changes or ADR-002 for gate/threshold changes
6. Do not ship if release profile fails.
