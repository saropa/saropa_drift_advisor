# Feature 73: Website Bulk Index Creation

**Status: PLANNED** — split out of the archived GAP parity analysis (originally
WP-A05 / section 11 row "Bulk index creation"). The website applies index
suggestions one at a time; this adds multi-select batch apply with SQL preview.

Source: [GAP_FIT_PLAN.md (archive)](./history/2026.06/2026.06.10/GAP_FIT_PLAN.md) §11.

## Gap

| Surface | Capability            | State       |
| ------- | --------------------- | ----------- |
| W       | Bulk index creation   | **missing** |

## Tasks

- Add a multi-select control to the index suggestion list.
- Generate a merged SQL preview with per-index status.
- Apply as one action with partial-failure reporting.
- Provide rollback guidance (or generated rollback SQL when available).

## Exit criteria

- User can select 2+ suggestions, preview the merged SQL, apply in one action,
  and validate the resulting schema/indexes; partial failures are reported.

## Tracking

- Owner: TBD
- Target: TBD
- State: planned
- Evidence: TBD
