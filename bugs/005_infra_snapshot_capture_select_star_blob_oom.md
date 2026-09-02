# BUG: Server-side snapshot capture still issues unbounded `SELECT *` per table (the BLOB OOM fixed in the extension in v4.1.17)

**Status: Open**

Created: 2026-09-02
Component: Server
File: `lib/src/server/snapshot_handler.dart` (lines ~38-42 and ~228-233)
Severity: Crash

---

## Summary

`POST /api/snapshot` reads **every row of every table** with `SELECT *` and no `LIMIT`, holds the
full result set in memory as Dart maps, retains up to 20 such snapshots
(`ServerContext.maxSnapshots`), and — when `snapshotStorePath` is configured — re-serializes the
entire retained list to a single JSON string on each capture. This is the exact defect the
TypeScript extension fixed in v4.1.17 by introducing `blobSafeSelectList()`; that helper exists only
under `extension/src/`, and the Dart server capture path was never converted.

---

## Attribution Evidence

```bash
# Positive — the unbounded SELECT * capture lives in the Dart server
grep -rn "SELECT \* FROM \${ServerUtils.quoteIdent" lib/src/server/
# lib/src/server/mutation_tracker.dart:240:          'SELECT * FROM ${ServerUtils.quoteIdent(table)} WHERE $whereClause';
# lib/src/server/mutation_tracker.dart:262:          'SELECT * FROM ${ServerUtils.quoteIdent(table)} '
# lib/src/server/report_handler.dart:120:      query('SELECT * FROM ${ServerUtils.quoteIdent(table)} LIMIT $maxRows'),
# lib/src/server/snapshot_handler.dart:40:          'SELECT * FROM ${ServerUtils.quoteIdent(table)}',
# lib/src/server/snapshot_handler.dart:231:                        'SELECT * FROM ${ServerUtils.quoteIdent(table)}',
# lib/src/server/table_handler.dart:195:      'SELECT * FROM ${ServerUtils.quoteIdent(tableName)} LIMIT $limit OFFSET $offset',
#
# snapshot_handler.dart:40 and :231 are the two with NO LIMIT at all.

# Negative — the blob-safe helper the v4.1.17 fix introduced does not exist on the Dart side
grep -rn "blobSafeSelectList" lib/
# (0 matches)
grep -rn "blobSafeSelectList" extension/src/sql/
# extension/src/sql/blob-safe-select.ts:50:export function blobSafeSelectList(columns: readonly ColumnMetadata[]): string {
```

**Emit site(s) — list ALL:** `lib/src/server/snapshot_handler.dart:40` (`handleSnapshotCreate`),
`lib/src/server/snapshot_handler.dart:231` (`handleSnapshotCompare`, live-DB target).
**Diagnostic `source` / `owner` as seen in Problems panel:** n/a (runtime server behavior).

---

## Environment

- OS:
- VS Code version:
- Extension version:
- Dart SDK version:
- Flutter SDK version (if applicable):
- Database type and version: SQLite (any); reproduces fastest with a BLOB column
- Connection method: HTTP loopback
- Relevant non-default settings: `snapshotStorePath` amplifies the memory spike but is not required
- Other potentially conflicting extensions:

---

## Minimal Reproducible Example

```sql
CREATE TABLE photos (id INTEGER PRIMARY KEY, bytes BLOB);
-- 1000 rows of 1 MB each ≈ 1 GB of BLOB payload
INSERT INTO photos (bytes) SELECT randomblob(1048576) FROM generate_series(1,1000);
```

```bash
curl -X POST http://127.0.0.1:8642/api/snapshot -d '{}'
```

The connected app pulls ~1 GB of blob bytes into the Dart isolate, converts each to a
`List<int>` inside `ServerUtils.normalizeRows`, and stores it in `ServerContext.snapshots`. On a
mobile embedder this aborts the process (`SIGABRT`, native OOM) — the same failure mode recorded in
`plans/history/2026.06/2026.06.28/BUG_TIMELINE_CAPTURE_SELECT_STAR_BLOB_OOM.md` for the extension.

A second capture doubles it; the cap is 20 retained snapshots.

---

## Expected Behavior

The server capture should mirror the extension fix: read `PRAGMA table_info` for each table, build a
select list that substitutes `length(<col>) AS <col>` for BLOB-affinity columns, and apply a row cap
consistent with `ServerConstants.maxSqlResultRows` (with a `truncated` flag in the response, as
`SqlHandler.runSqlResult` already does).

---

## Actual Behavior

`SELECT * FROM "<table>"` with no column filtering and no row limit, once per table, retained up to
20 times, and (with `snapshotStorePath` set) fully JSON-serialized to a single in-memory string on
every capture/delete/rename via `ServerContext._persistSnapshots` → `SnapshotStore.save`.

---

## Error Output

Native OOM abort in the connected app; no Dart stack trace is produced.

---

## Duplicate-Emission Check

Two language paths, one already fixed:
- TypeScript (`extension/src/timeline/snapshot-store.ts:231`) — **fixed** in v4.1.17, uses
  `blobSafeSelectList`.
- Dart (`lib/src/server/snapshot_handler.dart:40`) — **not fixed**, this report.

This is precisely the "fixing only one language path" pitfall the guide's Common Pitfalls table
warns about, and it is also the "SELECT * in capture queries" row of that same table.

---

## What I Already Tried

- [x] Grepped `lib/` for `blobSafeSelectList` — zero matches
- [x] Confirmed `ServerContext.maxSnapshots == 20` and `addSnapshot` retains all of them in memory
- [x] Confirmed `SnapshotStore.save` serializes the whole list per write

---

## Regression Info

- Last working version: n/a — the Dart path was never converted
- First broken version: present since server-side snapshots were added
- What changed: v4.1.17 fixed the TS capture sweeps only

---

## Root Cause

The v4.1.17 BLOB fix was scoped to the extension's own capture sweeps (timeline snapshot, branch,
data-breakpoint). The Dart server has an independent snapshot implementation that was not audited in
that pass.

**Proposed fix sketch:**

1. Add `lib/src/server/blob_safe_select.dart` mirroring `extension/src/sql/blob-safe-select.ts`:
   given `PRAGMA table_info` rows, emit `"col"` for non-BLOB columns and `length("col") AS "col"`
   for BLOB-affinity ones; fall back to `*` only for an empty column list.
2. Use it at both `snapshot_handler.dart:40` and `:231`, and add
   `LIMIT ${ServerConstants.maxSqlResultRows}` with a per-table `truncated` flag in the snapshot
   payload.
3. Cache the per-table select list for the duration of one capture so the `PRAGMA` sweep is one
   round-trip per table, not per row.
4. Regression test: build an in-memory table with a large BLOB, capture, assert the stored value is
   an integer length and that peak allocation stays bounded.

---

## Changes Made

<!-- Fill in when a fix is written. -->

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- Who is affected: any host whose schema holds image/attachment/document BLOBs, or any table large
  enough that a full materialization does not fit in the app's heap.
- What is blocked: snapshots and snapshot compare are unusable on such schemas.
- Data risk: none directly, but the connected app is killed mid-session, which can leave the app's
  own writes half-applied.
- Frequency: deterministic for a schema over the memory budget; the same capture always aborts.
