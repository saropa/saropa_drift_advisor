# Feature 72: Website Multiple Snapshots

**Status: PLANNED** — split out of the archived GAP parity analysis (originally
WP-A04 / section 8 row "Multiple snapshots (W has 1)"). The website holds a
single snapshot; the extension supports many. This closes the snapshots /
time-travel parity gap.

Source: [GAP_FIT_PLAN.md (archive)](./history/2026.06/2026.06.10/GAP_FIT_PLAN.md) §8.

## Gap

| Surface | Capability           | State              |
| ------- | -------------------- | ------------------ |
| W       | Multiple snapshots   | **only 1**         |
| E       | Multiple snapshots   | present            |

## Tasks

- Extend snapshot storage to support multiple named entries.
- Add snapshot list/select UI and pairwise diff controls.
- Persist/reload the selected snapshot context in session state.
- Guard against empty/invalid snapshot states.

## Exit criteria

- User can create at least 3 snapshots, switch among them, diff any pair, and
  retain the list after reload.

## Tracking

- Owner: TBD
- Target: TBD
- State: planned
- Evidence: TBD
