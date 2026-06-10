# Feature 71: Website Dart Schema Scanning

**Status: PLANNED** — split out of the archived GAP parity analysis (originally
WP-A03 / section 5 row "Dart schema scanning"). The website cannot yet derive a
schema by scanning Dart Drift source; the extension can. This is the remaining
schema-parity gap.

Source: [GAP_FIT_PLAN.md (archive)](./history/2026.06/2026.06.10/GAP_FIT_PLAN.md) §5.

## Gap

| Surface | Capability                | State       |
| ------- | ------------------------- | ----------- |
| W       | Dart schema scanning      | **missing** |
| E       | Dart schema scanning      | present     |

Effort/usefulness were never estimated (carried as `N/A` in the parity table);
the first deliverable is to set concrete values or defer with a milestone.

## Tasks

- Define the website UI entry point and the scan output format.
- Implement the scan pipeline; surface errors with actionable guidance.
- Document supported inputs and limitations.
- Re-estimate effort/usefulness from `N/A` to concrete values.

## Exit criteria

- If implemented: website runs a schema scan from a UI flow and a manual
  verification pass succeeds.
- If deferred: owner + milestone + rationale recorded here.

## Tracking

- Owner: TBD
- Target: TBD
- State: planned
- Evidence: TBD
