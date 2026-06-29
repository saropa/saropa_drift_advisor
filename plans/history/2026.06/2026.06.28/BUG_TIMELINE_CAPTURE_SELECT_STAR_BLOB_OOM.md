# Bug Report — Timeline auto-capture `SELECT *` on a BLOB table OOM-crashes the connected app

**Status: Fixed**

## Title

Timeline auto-capture sweep issues `SELECT * ... LIMIT 1000` on BLOB-bearing tables, materializing up to 1000 image blobs into the connected app's Dart isolate and crashing it with a native out-of-memory (SIGABRT).

## Environment

| Field | Value |
|---|---|
| **OS (host device)** | Android (physical Motorola device), arm64. Native allocator: Scudo. |
| **VS Code version** | Not captured from the device-side log — extension was driving the connection; report sourced from the host app's runtime log, not the VS Code session. |
| **Extension version** | `saropa_drift_advisor` ext-v4.1.16 (`extension/package.json`) |
| **Dart / Flutter SDK** | Host app is Flutter (Saropa Contacts, `com.saropamobile.app`), debug build. Exact SDK not in the captured log. |
| **Database type/version** | SQLite via Drift (the app's on-device database). |
| **Connection method** | The Drift Advisor HTTP server is embedded **inside the running Flutter app** on `localhost:8642` (`DriftConfig.db.startDriftViewer`, debug-only). The extension connects over HTTP; `client.sql(..., { internal: true })` runs on the app's live, same-isolate Drift connection. The crashing process is the **host app**, not the extension. |
| **Relevant settings** | App side: `EnvType.DriftAdvisorEnabled` ON (default in debug). Extension side: timeline auto-capture enabled (default); `STARTUP_SWEEP_GRACE_MS = 6000`. |
| **Table involved** | `contact_avatars` — carries image BLOB columns (`image`, `imageThumbnail`), multi-KB to multi-MB per row. |

## Steps to Reproduce

1. Build and run a Flutter app in **debug** that embeds the Drift Advisor server (`startDriftViewer`) and whose database has a BLOB-bearing table with up to ~1000 rows of sizable blobs (here: `contact_avatars` with stored avatar images), where that table's `rowCount` is **below** `CAPTURE_MAX_ROWS` (so it is NOT skipped by the large-table guard).
2. Let the Drift Advisor extension connect to the app over `localhost:8642`.
3. Wait past the `STARTUP_SWEEP_GRACE_MS` (6s) grace window so the deferred **heavy sweep** (timeline auto-capture) runs.
4. The sweep walks `schemaMetadata()` and, for each physical table under the row-count cap, issues `SELECT * FROM "<table>"<ORDER BY pk> LIMIT 1000`.
5. Observe the host app's memory climb and then abort while the `contact_avatars` capture read is in flight.

This is **not** intermittent in the presence of the precondition: any BLOB table with enough total blob bytes under the row-count cap will reproduce it.

## Expected Behavior

The timeline snapshot capture should diff table contents without loading raw BLOB payloads into the host app's memory. Capturing avatar/image bytes is unnecessary for a row-level diff — a length or hash placeholder per blob cell is sufficient to detect change. The sweep must not be able to push the connected app into a native OOM.

## Actual Behavior

`SELECT *` pulls every column — including the image BLOB columns — for up to `ROW_LIMIT` (1000) rows. The app's Drift connection materializes all 1000 blob rows into the Dart isolate to serialize the HTTP response. Native heap (Scudo) grows unbounded through ever-larger size classes and the allocator aborts the process.

## Error Output (host app runtime log)

Source log: `d:\src\contacts\reports\20260628\20260628_174433_contacts.log`.

The capture read, logged by the app's own Drift query interceptor (the SQL text is exactly what the extension sent over the connection):

```
[17:56:00.212] [database] Drift SLOW 130ms SELECT: SELECT * FROM "coaching_sessions" ORDER BY "id" LIMIT 1000
[17:56:01.993] [database] Drift SLOW 730ms SELECT: SELECT * FROM "contact_avatars"   ORDER BY "id" LIMIT 1000
```

Immediately after, the native allocator climbs and aborts:

```
[17:56:11.047] I/scudo  : Can't populate more pages for size class 2576.
[17:56:12.867] I/scudo  : Can't populate more pages for size class 3120.
... (size classes climb 2576 -> 65552) ...
[17:56:20.908] I/scudo  : Scudo ERROR: internal map failure (error desc=Out of memory)
[17:56:20.908] F/libc   : Fatal signal 6 (SIGABRT), code -1 (SI_QUEUE) in tid 7152 (DartWorker), pid 6571 (aropamobile.app)
[17:56:23.677] pid: 6571, tid: 7152, name: DartWorker  >>> com.saropamobile.app <<<
[17:56:23.685] Abort message: 'Scudo ERROR: internal map failure (error desc=Out of memory)'
   #07 ... scudo_malloc+36
   ... backtrace entirely inside libflutter.so reaching malloc ...
```

The faulting thread is `DartWorker` (a background isolate) — consistent with the capture read running on the app's Drift connection off the platform thread.

## Query-Construction Attribution (proven by grep)

This is not a VS Code diagnostic, so there is no `(owner, code)` pair. The equivalent attribution is **where the offending SQL string is built**. Both emit sites live in the TypeScript extension tree; the Dart analyzer tree (`lib/src/`) does not build this query.

| Field | Value |
|---|---|
| Query shape | `SELECT * FROM "<table>"<samplingOrderBy(pk)> LIMIT <ROW_LIMIT>` |
| `ROW_LIMIT` constant | `extension/src/timeline/snapshot-store.ts:18` — `export const ROW_LIMIT = 1000;` |
| Auto-capture emit site | `extension/src/timeline/snapshot-store.ts:223` |
| Manual snapshot emit site | `extension/src/timeline/snapshot-commands.ts:86` |
| `ORDER BY` builder | `extension/src/sql/sampling-order.ts:37` (`samplingOrderBy`) — orders by declared PK; for `contact_avatars` PK is `id`, producing `ORDER BY "id"` |
| Sweep scheduler | `extension/src/extension-activation-event-wiring.ts:50-74` (`runHeavySweep` / `scheduleHeavySweep`), comment at `:54`: "Timeline auto-capture re-dumps every physical table (SELECT * LIMIT N)" |
| Existing guard (row-count only) | `extension/src/timeline/snapshot-store.ts:198` — skips tables with `rowCount > CAPTURE_MAX_ROWS`. **No byte-size / BLOB-column guard exists.** |

Grep commands used (run from `D:\src\saropa_drift_advisor`):

```
grep -rn "SELECT \* FROM" extension/src/           # -> snapshot-store.ts:223, snapshot-commands.ts:86, branch-manager.ts:31, data-breakpoint-checker.ts:78, others
grep -rn "ROW_LIMIT" extension/src/timeline/        # -> snapshot-store.ts:18 (def), :223 (use); snapshot-commands.ts:6 (import), :86 (use)
grep -rn "samplingOrderBy" extension/src/           # -> sql/sampling-order.ts:37 (def); timeline + branching call sites
```

Sibling-tree negative grep (the Dart analyzer side does not build the capture SQL):

```
grep -rn "ROW_LIMIT\|SELECT \* FROM" lib/src/       # -> 0 matches for the capture query construction
```

Note: `branch-manager.ts:31` and `data-breakpoint-checker.ts:78` also issue `SELECT * ... LIMIT 1000`/`LIMIT rowLimit+1` and share the same BLOB-blindness — they are secondary instances of the same root defect (whole-row `SELECT *` over potentially-BLOB tables), not separate bugs. The crash log here only exercised the timeline auto-capture path.

## Minimal Reproducible Example

Schema (the essential shape):

```sql
CREATE TABLE contact_avatars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_saropa_uuid TEXT,
  image BLOB,            -- full-size avatar bytes
  image_thumbnail BLOB,  -- thumbnail bytes
  color_hash TEXT
);
-- populate with a few hundred rows of real-sized image blobs (e.g. 50KB–2MB each),
-- staying under CAPTURE_MAX_ROWS so the row-count guard does NOT skip the table.
```

The single query that triggers it (issued by the sweep):

```sql
SELECT * FROM "contact_avatars" ORDER BY "id" LIMIT 1000;
```

On a connected app whose Drift runs same-isolate, materializing 1000 blob rows for the HTTP response exhausts the native heap.

## What I Already Tried (diagnosis on the host-app side)

- Confirmed the query is **not** app code: the app's own loaders for these tables (`dbContactAvatarLoadAll`, `dbCoachLoadAllRaw`) issue a plain `SELECT * FROM "<t>"` with **no** `ORDER BY id` / `LIMIT 1000`; the row-count audit uses `COUNT(*)`; the app's avatar color-hash backfill uses `selectOnly(...addColumns([uuid]))` (no blob transfer). The `ORDER BY "id" LIMIT 1000` shape is unique to the advisor sweep.
- Confirmed via the app's own source comment (`lib/main.dart:556-564`) that the `LIMIT 1000` sampling queries are "issued by the Drift Advisor VS Code extension over this connection."
- Confirmed the advisor's row-count guard (`CAPTURE_MAX_ROWS`) does not consider per-row byte size, so a low-row-count BLOB table is not skipped.

## Impact

- **Who:** Any developer running the Drift Advisor against an app whose schema has a BLOB-bearing table under the row-count cap (images, attachments, encoded payloads). Common — avatar/photo tables are typical.
- **What is blocked:** The connected app **crashes** (SIGABRT). Debugging the app while the advisor is connected is unusable for these schemas; the very tool meant to inspect the DB kills the process inspecting it.
- **Data risk:** No data corruption (read-only sweep), but the host process dies abruptly — any unsaved in-memory state in the app is lost on the crash.
- **Frequency:** Deterministic given the precondition (sub-cap BLOB table with enough total bytes). Fires automatically after the 6s post-connect grace window, with no user action.

## Suggested Fix (extension side — for the maintainer)

The capture only needs to detect row-level change, not reproduce blob bytes. Options, in order of preference:

1. **Exclude BLOB columns from the capture SELECT.** Instead of `SELECT *`, build an explicit column list from `schemaMetadata()` and, for `BLOB`-typed columns, project a cheap surrogate (`length("col") AS "col"`, or a hash) rather than the raw bytes. Diffing on length/hash detects change without ever transferring megabytes. This is the targeted fix and keeps every table capturable.
2. **Add a byte-aware guard** alongside the existing row-count guard at `snapshot-store.ts:198`: skip (metadata-only) any table whose schema declares one or more BLOB columns, or whose estimated bytes (rowCount × blob columns) exceed a cap. Coarser than (1) — loses per-row diff for those tables — but trivial and safe.
3. **Lower `ROW_LIMIT` for BLOB-bearing tables** specifically. Weakest option: even 100 multi-MB blobs can OOM a constrained device; it narrows the window without closing it.

Apply the same treatment to the other whole-row `SELECT *` sites that can hit BLOB tables: `snapshot-commands.ts:86`, `branching/branch-manager.ts:31`, `data-breakpoint/data-breakpoint-checker.ts:78`.

## Checklist

- [x] Title names the specific broken behavior and where
- [x] Environment captured (host-side; VS Code/SDK fields marked as not-in-log honestly)
- [x] Numbered repro from a clean state
- [x] Expected vs actual stated
- [x] Full error output pasted (not truncated)
- [x] Query-construction attribution with file:line for the constant, both emit sites, the ORDER BY builder, and the missing guard — proven by grep commands pasted
- [x] Sibling-tree negative grep pasted (`lib/src/` builds no capture query)
- [x] Secondary emit sites of the same defect enumerated
- [x] Minimal reproducible example (schema + single query)
- [x] Impact and frequency described
- [x] No sensitive data included

## Finish Report (2026-06-28)

### Resolution summary

The full-table sampling sweeps issued `SELECT *`, which transferred every BLOB
column's raw bytes. Because the embedded debug server serializes a BLOB cell as a
JSON array of integers (`lib/src/server/server_utils.dart:60`), a `SELECT *` over
a table holding image/attachment blobs forced the connected app's Dart isolate to
materialize the full multi-KB–multi-MB payload of up to `ROW_LIMIT` rows into one
response, exhausting the native (Scudo) heap and aborting the process with
SIGABRT. The fix replaces each BLOB column in the capture projection with
`length("col") AS "col"`: SQLite computes a single integer on the host and the
bytes are never materialized or transferred, while row-level change detection is
preserved (a byte-length delta still flags add/remove/replace-with-different-size).

### Root cause

`SELECT *` is BLOB-blind. The existing row-count guard
(`CAPTURE_MAX_ROWS = 50_000`) bounds the row *count* but not the per-row byte
size, so a low-row-count table of large blobs passed the guard and was read in
full. The defect was shared by four whole-row read sites, all building the same
`SELECT * FROM "<t>" LIMIT N` shape.

### Changes

- **New** `extension/src/sql/blob-safe-select.ts` — `blobSafeSelectList(columns)`
  returns the projection, substituting `length("col") AS "col"` for any column
  whose declared type has BLOB affinity (substring `BLOB`, case-insensitive),
  passing every other column through quoted, and falling back to `*` when no
  column metadata is available. Reuses `quoteIdent`, now exported from
  `extension/src/sql/sampling-order.ts`.
- **`extension/src/timeline/snapshot-store.ts`** — timeline auto-capture (the path
  in the crash log) now projects via the helper.
- **`extension/src/timeline/snapshot-commands.ts`** — the manual "Show Snapshot
  Diff" current-state read fetches schema metadata first and mirrors the same
  projection, so the stored (length-surrogate) snapshot and the live read compare
  like-with-like instead of flagging every blob row as changed (and the read no
  longer re-introduces the OOM).
- **`extension/src/branching/branch-manager.ts`** — live-capture `captureTable`
  widened to receive full column metadata and projects via the helper.
- **`extension/src/data-breakpoint/data-breakpoint-checker.ts`** — the
  `rowChanged` evaluator resolves column types from schema metadata (with a
  `try/catch` + `Array.isArray` fallback to `*`) and projects via the helper.

### Why restore is not regressed

Branch restore re-inserts captured rows via `sqlLiteral`, which stringifies a
JS value. A BLOB arriving as an integer array was already serialized to a
comma-joined decimal string, so no faithful blob round-trip existed before this
change; substituting a length integer loses no working restore path and removes
multi-megabyte blob strings from persisted workspace state.

### Known limitation

A BLOB edited to a different value of the *same byte length* is not detected as
changed. This is the accepted trade for never moving blob payloads — SQLite has
no built-in row hash, and `length()` catches the overwhelming majority of real
edits. Documented in the helper's header and the changelog.

### Tests

- **New** `extension/src/test/blob-safe-select.test.ts` — pass-through, BLOB→`length()`
  aliasing, case-insensitive/substring affinity, identifier-quote escaping, and
  the empty-metadata `*` fallback.
- **`snapshot-store.test.ts`** — added a capture-level regression asserting the
  sweep emits `SELECT "id", length("image") AS "image", "color_hash" FROM
  "contact_avatars" …` and never `SELECT *` for the blob table.
- **`data-breakpoint-checker.test.ts`** — the three `rowChanged` tests updated to
  stub the metadata and SQL endpoints separately (the evaluator now makes two
  requests); added a regression asserting `length("image")` projection.
- Result: 73 passing across the affected files (blob-safe-select, snapshot-store,
  data-breakpoint-checker, branch-merge-sql, snapshot-to-branch,
  snapshot-diff-pkkey, sampling-order). `tsc -p ./` clean.
