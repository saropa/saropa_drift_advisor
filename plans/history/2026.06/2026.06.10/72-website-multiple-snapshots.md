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

- Owner: shipped
- Target: shipped 2026-06-10 (Phases 1–3; Phase 4 optional, deferred)
- State: complete (core)
- Evidence: server multi-slot at `lib/src/server/server_context.dart`
  (`snapshots` list + helpers); extension N-snapshot reference
  `extension/src/timeline/snapshot-store.ts`.

---

## Finish Report (2026-06-10) — Phases 1–3 (Phase 4 deferred, optional)

**Scope.** (A) Dart package (`lib/`, `test/`) + web assets (`assets/web/`). No Flutter app UI, no VS Code extension.

**What changed.**
- **`lib/src/server/server_types.dart`** (Phase 1) — `Snapshot` gains an optional `label` (display-only; the timestamp `id` stays the key) and a `withLabel` copy helper. The const constructor stays compatible, so `server_types_test.dart` is unaffected.
- **`lib/src/server/server_context.dart`** (Phase 1) — replaced `Snapshot? snapshot` with a capped `List<Snapshot> snapshots` (`maxSnapshots = 20`, oldest-first eviction mirroring the extension) plus `latestSnapshot`, `addSnapshot`, `snapshotById`, `removeSnapshot`, `replaceSnapshot`, `clearSnapshots`.
- **`lib/src/server/snapshot_handler.dart`** (Phases 1–2) — `handleSnapshotCreate` now appends and reads an optional `{label}` body (empty body still valid → unlabeled); `handleSnapshotGet` returns the latest (back-compat); new `handleSnapshotList`, `handleSnapshotDeleteOne` (404 on unknown id), `handleSnapshotRename` (404 on unknown id); `handleSnapshotCompare` now resolves `from` (param or latest) and `to` (param snapshot, or live "now" when omitted; 400 on an unknown `to`), reusing the existing `_addRowLevelDiff` for both stored-vs-stored and stored-vs-live; bare `DELETE` clears all.
- **`lib/src/server/server_constants.dart`** — `pathApiSnapshots`/prefix, `methodPut`, `queryParamFrom/To`, and `jsonKeySnapshots/label/to` keys.
- **`lib/src/server/router.dart`** — routed `GET /api/snapshots`, `DELETE`/`PUT /api/snapshot/{id}` (guarded so `/compare` is never treated as an id), and threaded the create request through for the label body.
- **`assets/web/tools-compare.ts`** (Phase 3) — `initSnapshot` rewritten: capture prompts for a label and POSTs it; a dynamically-injected list (no `html_content.dart` change) shows each snapshot with rename/delete; **From** and **To** selectors drive pairwise compare, with *To* defaulting to "now (live DB)" so the classic snapshot-vs-current diff is still one click; delegated handlers survive re-render; export-diff href tracks the selection. `assets/web/bundle.js` rebuilt.
- **`CHANGELOG.md`** — `[Unreleased]` Added entry.

**Back-compat.** The single-snapshot endpoints (`POST`/`GET /api/snapshot`, no-arg `/compare`, bare `DELETE`) keep their old semantics over the most-recent snapshot — verified by the unchanged `handler_integration_test.dart`, `snapshot_handler_test.dart`, and `server_types_test.dart` (all still green).

**Testing.**
- **New `test/snapshot_multi_test.dart`** — 8 cases: append + list with labels, latest-from-GET, pairwise from/to compare (asserts `to` echoes the stored id), no-arg compare-vs-live (`to` null), unknown-`to` → 400, per-id delete + 404 + clear-all, PUT rename + 404, and oldest-eviction past the cap. Added an `httpPut` helper to `test/helpers/test_helpers.dart`.
- `dart analyze` clean; `dart test` → **579 passing** (+8). `npm run typecheck:web` clean; bundle rebuilt.

**l10n.** SKIPPED [web-not-Flutter] — the web viewer is plain-English HTML outside the Flutter ARB catalog.

**Phase 4 (optional persistence) — deferred by design.** The plan marked Phase 4 ("persist across reload via localStorage or a host store") optional and "defer unless required — flag as a separate decision before building." The exit gate "retain the list after reload" is already met: snapshots live server-side, so a browser page reload re-fetches them via `GET /api/snapshots`. Phase 4 only adds survival across a **server restart** (in-memory state is lost on restart), which is a separate, unrequested concern; if wanted later it should be its own plan. Not built.

**Outstanding.** None for the delivered scope (Phases 1–3, exit gate met). Phase 4 explicitly deferred as above.

**Finish report appended:** plans/72-website-multiple-snapshots.md (this section). Core complete → archived to plans/history/2026.06/2026.06.10/ (Phase 4 optional/deferred, documented here).

---

## Finish Report (2026-06-12) — Phase 4 (persistence across server restart)

Builds the deferred Phase 4. Phases 1-3 kept the snapshot list in memory on
`ServerContext`, so it survived a browser reload (re-fetched via
`GET /api/snapshots`) but not a restart of the host app's debug session — the
in-memory list was lost when the process stopped. An opt-in on-disk store now
mirrors the list so it outlives a server restart.

**Opt-in, zero default change.** A new optional `snapshotStorePath` on
`DriftDebugServer.start` enables persistence. When it is null (the default),
nothing is read or written and behavior is byte-identical to before — no
surprise disk writes. The path is host configuration (the app developer chooses
it), never user or network input.

**What changed.**

- **`lib/src/server/server_types.dart`** — `Snapshot` gained `toJson()` and a
  tolerant `static fromJson()` that returns null for a malformed record (missing
  id, unparseable date, wrong shape) so one bad entry is skipped rather than
  failing the whole load.
- **`lib/src/server/snapshot_store.dart`** (new) — `SnapshotStore.load`/`save`.
  Writes are atomic (serialize → write `<path>.tmp` → rename over the target) so
  a crash mid-write can't leave a half-written file; loads tolerate an absent,
  empty, corrupt, or wrong-shape file by returning empty. Both are best-effort:
  failures are routed to an `onError` logger (wired to `ServerContext.logError`)
  rather than thrown, so a disk problem never breaks a snapshot operation. The
  trusted-host-path lints are suppressed inline with rationale.
- **`lib/src/server/server_context.dart`** — `snapshotStorePath` field;
  `loadPersistedSnapshots()` (called at startup, caps the loaded list to
  `maxSnapshots`, keeping the newest); `_persistSnapshots()` invoked from
  `addSnapshot`/`removeSnapshot`/`replaceSnapshot`/`clearSnapshots`, serialized
  through a single write chain so rapid mutations can't interleave their writes;
  and a `snapshotPersistenceSettled` getter so a host can flush before shutdown
  (and tests have a deterministic read point).
- **`lib/src/drift_debug_server_io.dart`** — `snapshotStorePath` threaded through
  both `start` declarations and into `ServerContext`; `loadPersistedSnapshots()`
  is awaited before the server binds, so a restart serves the restored list.
- **`lib/src/drift_debug_server_stub.dart`** — param added to the stub signature
  for source compatibility on unsupported platforms.

**Testing.**

- **New `test/snapshot_persistence_test.dart`** (11 cases): Snapshot JSON
  round-trip (label present/absent, malformed → null); `SnapshotStore` save/load
  round-trip, missing-file → empty, corrupt-file → empty + error surfaced,
  per-record corruption skipped; `ServerContext` survives a simulated restart
  (write with one context, reload with a fresh one on the same path),
  delete/clear rewrite the file, no-path stays in memory and writes nothing, and
  an over-cap stored list loads capped to the newest `maxSnapshots`.
- `dart test` → **632 passing** (+11). `dart analyze` on all changed/new files →
  **No issues found** (saropa_lints clean).

**l10n.** SKIPPED [no-UI] — no Flutter or web UI strings; a host-API option plus
server-side persistence.

**Back-compat.** The new param is optional; the new `Snapshot` JSON methods are
additive; existing snapshot tests (`snapshot_multi_test`, `snapshot_handler_test`,
`server_types_test`) are untouched and green.

**Outstanding.** None. The exit-gate concern Phase 4 named — survival across a
server restart — is met for hosts that opt in via `snapshotStorePath`.

**Finish report appended:** plans/history/2026.06/2026.06.10/72-website-multiple-snapshots.md
(this section). No bug archive — task did not close a `bugs/*.md` file.
