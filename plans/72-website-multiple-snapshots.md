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

## Implementation Plan

### Current single-slot reality

- Storage is one field: `ServerContext.snapshot` (`Snapshot?`) in
  `lib/src/server/server_context.dart`. `POST /api/snapshot` overwrites it;
  `DELETE /api/snapshot` nulls it (`lib/src/server/snapshot_handler.dart`).
- `Snapshot` model lives in `lib/src/server/server_types.dart`
  (`id` = ISO8601 timestamp, `createdAt`, `tables`).
- Compare is current-DB-vs-stored only: `GET /api/snapshot/compare`
  (`handleSnapshotCompare` + `_addRowLevelDiff`, PK-keyed with signature
  fallback) in `snapshot_handler.dart`.
- In-memory only; nothing survives a server restart.

### Reference: extension already does N snapshots

`extension/src/timeline/snapshot-store.ts` — `ISnapshot[]` rolling window
(`_maxSnapshots`, default 20), `getById()`, `diffByPk()` / `diffBySignature()`.
Port its shape, not its code.

### Phase 1 — Storage: one slot → many

- Replace `Snapshot? snapshot` with an ordered `List<Snapshot>` (or
  `Map<String, Snapshot>` keyed by id) on `ServerContext`, plus a capacity cap
  with oldest-first eviction (mirror the extension's `_maxSnapshots`).
- Add an optional user-supplied `label` to the `Snapshot` model
  (`server_types.dart`); keep the timestamp `id` as the stable key.
- Add lookups: `snapshotById(id)`, `listSnapshots()`.

### Phase 2 — Endpoints (`snapshot_handler.dart` + `router.dart`)

- `POST /api/snapshot` — accept optional `{label}`, append instead of overwrite.
- `GET /api/snapshots` — list `{id, createdAt, label, tableCount}` (new).
- `GET /api/snapshot/compare?from={id}&to={id}` — pairwise diff between two
  stored snapshots; keep `to` omitted = "now" for back-compat with the current
  current-vs-stored behavior. Reuse `_addRowLevelDiff` (it already takes two row
  sets — feed it two snapshots instead of snapshot+live).
- `DELETE /api/snapshot/{id}` — delete one; keep bare `DELETE /api/snapshot` =
  clear all.
- `PUT /api/snapshot/{id}` — rename label (new).
- Add the new path constants to `server_constants.dart`.

### Phase 3 — Web viewer UI

- Extend `assets/web/tools-compare.ts` (`initSnapshot`): render a snapshot
  **list** with labels + delete buttons, and two selectors (from / to) driving
  the pairwise compare. Today it has only single status + one compare button
  (`#snapshot-take`, `#snapshot-compare`, `#snapshot-status` in
  `lib/src/server/html_content.dart`).
- Reuse `renderRowDiff()` in `assets/web/analysis.ts` unchanged for the diff
  output.

### Phase 4 — Persistence (optional, gated)

- Persist the snapshot list (localStorage on the client for metadata, or a
  host-side store) so it survives reload. Defer unless required — flag as a
  separate decision before building.

### Exit gate

- Create ≥3 labelled snapshots, list them, diff any pair, delete one, and
  confirm the list/selection survives a page reload.

## Tracking

- Owner: TBD
- Target: TBD
- State: planned
- Evidence: server single-slot at `lib/src/server/server_context.dart`
  (`snapshot` field); extension N-snapshot reference
  `extension/src/timeline/snapshot-store.ts`.
