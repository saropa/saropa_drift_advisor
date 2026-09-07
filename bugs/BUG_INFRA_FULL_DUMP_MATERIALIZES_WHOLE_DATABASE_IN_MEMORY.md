# BUG: `GET /api/dump` materializes the entire database as one in-memory string, with BLOBs hex-expanded 2×

**Status: Open**

Created: 2026-09-02
Component: Server
File: `lib/src/server/schema_handler.dart` (lines ~515-568), `lib/src/server/server_utils.dart` (line ~250)
Severity: Crash

---

## Summary

`SchemaHandler.getFullDumpSql` loops over every table, runs `SELECT *` with **no limit**, and appends
one `INSERT INTO …` line per row to a single `StringBuffer`, then returns
`buffer.toString()` — a second full copy — which `sendFullDump` writes in one `res.write(dump)`.
Nothing is streamed and nothing is capped. `ServerUtils.sqlLiteral` renders a BLOB as `X'<hex>'`, so
every blob byte becomes two UTF-16 code units, i.e. **4× the byte size in memory** before the buffer
copy. The endpoint is a plain unauthenticated `GET` in the default configuration.

---

## Attribution Evidence

```bash
# Positive — the unbounded dump builder
grep -an "getFullDumpSql\|SELECT \* FROM \"\$table\"\|buffer.toString()" lib/src/server/schema_handler.dart
# 516:  Future<String> getFullDumpSql(DriftDebugQuery query) async {
# 524:      final dynamic raw = await query('SELECT * FROM "$table"');
# 552:    return buffer.toString();

# Written to the socket in one shot, no streaming
grep -an "sendFullDump" -A 10 lib/src/server/schema_handler.dart | grep -n "res.write\|res.add"
#     res.write(dump);

# The 4x blob expansion
grep -n "X'" -B 8 lib/src/server/server_utils.dart | sed -n '1,14p'
#     if (value is List<int>) {
#       final hex = value.map((b) => b.toRadixString(...).padLeft(...,'0')).join();
#       return "X'$hex'";

# Contrast: the report endpoint DOES cap rows (ceiling 50000) — the dump caps nothing
grep -n "_maxRowsCeiling\|LIMIT \$maxRows" lib/src/server/report_handler.dart
# 30:  static const int _maxRowsCeiling = 50000;
# 120:      query('SELECT * FROM ${ServerUtils.quoteIdent(table)} LIMIT $maxRows'),

# And the SQL endpoint caps result rows — the dump does not
grep -n "maxSqlResultRows" lib/src/server/server_constants.dart
# 47:  static const int maxSqlResultRows = 10_000;
```

**Emit site(s) — list ALL:** `lib/src/server/schema_handler.dart:524` (unbounded read),
`:552` (buffer copy), `sendFullDump` (single `res.write`). Routed at
`lib/src/server/router.dart:765` (`GET /api/dump`, `GET /api/database` sibling).
**Diagnostic `source` / `owner` as seen in Problems panel:** n/a (runtime server behavior).

---

## Environment

- OS:
- VS Code version:
- Extension version:
- Dart SDK version:
- Flutter SDK version (if applicable):
- Database type and version: SQLite (any)
- Connection method: HTTP loopback
- Relevant non-default settings: none — no auth by default
- Other potentially conflicting extensions:

---

## Minimal Reproducible Example

```sql
CREATE TABLE photos (id INTEGER PRIMARY KEY, bytes BLOB);
INSERT INTO photos (bytes) SELECT randomblob(1048576) FROM generate_series(1,200);  -- 200 MB
```

```bash
curl -s http://127.0.0.1:8642/api/dump -o /dev/null
```

Peak allocation in the connected app:

| stage | size |
|---|---|
| rows from `SELECT *` (`List<int>` per blob) | ~200 MB |
| hex text in the `StringBuffer` (2 chars/byte, UTF-16) | ~800 MB |
| `buffer.toString()` copy | ~800 MB |
| **peak** | **~1.8 GB** |

On a mobile embedder the process is killed (native OOM / `SIGABRT`). On desktop it stalls for the
duration and then delivers a response.

---

## Expected Behavior

The dump should stream: write the schema, then for each table page through rows with
`LIMIT/OFFSET` (or a keyset cursor) writing each `INSERT` directly to the `HttpResponse` as it is
built, never retaining more than one page. A `?maxRows=` cap and a documented default ceiling should
apply, matching `report_handler`'s `_maxRowsCeiling` and `SqlHandler`'s `maxSqlResultRows`, and BLOB
columns should be excluded or capped unless explicitly requested.

---

## Actual Behavior

Whole-database materialization in two full copies, then one `write`.

---

## Error Output

Native OOM abort in the connected app; no Dart stack trace. On desktop, no error — just a long stall.

---

## Duplicate-Emission Check

Dart-only. The extension's own export path is separately capped
(`extension/src/timeline/snapshot-store.ts` uses `ROW_LIMIT`), so this is a one-sided Dart defect —
the same shape as `005_infra_snapshot_capture_select_star_blob_oom.md`, but a distinct endpoint and a
distinct mechanism (string materialization + hex expansion rather than retained row maps).

---

## What I Already Tried

- [x] Confirmed no `LIMIT`, no row cap, and no streaming anywhere in `getFullDumpSql` / `sendFullDump`
- [x] Confirmed `sqlLiteral`'s `X'<hex>'` path doubles byte count into UTF-16 characters
- [x] Confirmed sibling endpoints (`/api/report`, `/api/sql`, `/api/table/{name}`) all cap rows,
      making the dump the sole uncapped read path
- [x] Confirmed the endpoint is behind no auth in the documented default configuration

---

## Regression Info

- Last working version: n/a — the dump has never been bounded
- First broken version:
- What changed:

---

## Root Cause

`getFullDumpSql` returns a `String` by contract, which forces full materialization; the caller then
copies it again. The signature is the defect, not just the loop.

**Proposed fix sketch:**

1. Change the contract to `Future<void> writeFullDump(HttpResponse out, DriftDebugQuery query,
   {int maxRowsPerTable})` and write incrementally; keep a thin `getFullDumpSql` wrapper for tests
   that collects into a buffer with a small cap.
2. Page each table with `LIMIT n OFFSET k` (n = `ServerConstants.maxSqlResultRows`) so at most one
   page is resident.
3. Emit `-- TRUNCATED: <table> (<total> rows, <n> written)` when a table is capped, so a truncated
   dump is never mistaken for a complete backup.
4. Skip BLOB columns by default (emit `NULL` plus a comment), gated by `?blobs=true`; reuse the
   blob-safe select helper proposed in `005_infra_snapshot_capture_select_star_blob_oom.md`.
5. Route identifiers through `quoteIdent` while touching these lines — see
   `012_infra_schema_handler_raw_identifier_interpolation.md`, which covers the same block.
6. Regression test: dump a table with 100k rows and assert peak allocation stays bounded and the
   truncation marker is present.

---

## Changes Made

<!-- Fill in when a fix is written. -->

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- Who is affected: every host with a database larger than the app's spare heap; guaranteed on any
  schema storing images or attachments.
- What is blocked: `GET /api/dump` — and, because the app dies, the whole debugging session.
- Data risk: the connected app is killed mid-session, which can leave the app's own writes
  half-applied; a silently truncated dump would be worse, which is why the truncation marker is part
  of the fix.
- Frequency: deterministic for a database over the memory budget. A single unauthenticated GET is
  enough, so it is also a trivial local denial-of-service.
