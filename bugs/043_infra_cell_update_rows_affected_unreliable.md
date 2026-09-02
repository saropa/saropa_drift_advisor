# BUG: `/api/cell/update` reports `rowsAffected` from `changes()` on the READ callback, after an await gap

**Status: Open**

Created: 2026-09-02
Component: Server
File: `lib/src/server/cell_update_handler.dart` (lines ~200-215)
Severity: Wrong fix

---

## Summary

After running the `UPDATE` through `writeQuery`, the handler reads
`SELECT changes() AS c` through `_ctx.queryRaw` — the **read** callback, not the write one — and
reports the result as `rowsAffected`. SQLite's `changes()` is per-connection state describing the
most recent statement **on that connection**. When the host wires separate read and write callbacks
(the API explicitly supports this: `query` and `writeQuery` are independent parameters), the probe
observes the read connection and returns a value unrelated to the update. Even when both callbacks
share one connection, the `await` between the write and the probe lets any other in-flight request's
statement land first and overwrite `changes()`.

The same shape appears in `MutationTracker._captureAfterInsert`, which reads
`WHERE rowid = last_insert_rowid()` through `readQuery`.

---

## Attribution Evidence

```bash
# Positive — the probe and the callback it uses
grep -n "changes()" lib/src/server/cell_update_handler.dart
# 205:        await _ctx.queryRaw('SELECT changes() AS c'),

grep -n "last_insert_rowid" lib/src/server/mutation_tracker.dart
# 263:          'WHERE rowid = last_insert_rowid()';

# The write actually went through a DIFFERENT callback
grep -n "writeQuery(sql)" lib/src/server/cell_update_handler.dart
# 190:      await writeQuery(sql);

# read and write are separate host-supplied callbacks by design
grep -n "final DriftDebugQuery queryRaw\|final DriftDebugWriteQuery? writeQuery" lib/src/server/server_context.dart
# 86:  final DriftDebugQuery queryRaw;
# 172:  final DriftDebugWriteQuery? writeQuery;
```

**Emit site(s) — list ALL:** `lib/src/server/cell_update_handler.dart:205`,
`lib/src/server/mutation_tracker.dart:263`.
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
- Relevant non-default settings: `query` and `writeQuery` backed by distinct executors/connections
- Other potentially conflicting extensions:

---

## Minimal Reproducible Example

Wire the server so reads and writes use different Drift executors (a common pattern when reads run
against a read-only replica or a separate `DatabaseConnection`):

```dart
await DriftDebugServer.start(
  query: (sql) async => (await readDb.customSelect(sql).get()).map((r) => r.data).toList(),
  writeQuery: (sql) => writeDb.customStatement(sql),
);
```

```bash
curl -X POST http://127.0.0.1:8642/api/cell/update -H 'Content-Type: application/json' \
  -d '{"table":"users","pkColumn":"id","pkValue":1,"column":"name","value":"Ada"}'
```

The row IS updated, but the response reports `{"ok":true,"rowsAffected":0}` — the read connection has
executed no write, so its `changes()` is 0. The web UI then tells the user the edit matched nothing.

The inverse case is worse: a stale `pkValue` that matches no row can report a **non-zero**
`rowsAffected` inherited from an unrelated concurrent statement.

---

## Expected Behavior

`rowsAffected` should reflect the `UPDATE` this request issued: obtained from the write path itself
(a `writeQuery` variant that returns an affected-row count, or `RETURNING`-based confirmation, or a
`changes()` probe executed on the write connection immediately after the statement inside the same
callback).

---

## Actual Behavior

`rowsAffected` is read from a possibly-different connection after an await gap. The value is
meaningless in the split-connection case and racy in the shared-connection case. The in-code comment
at `cell_update_handler.dart:198-202` asserts "`changes()` reflects the last statement on the write
connection", which the code does not do.

---

## Error Output

No error — the endpoint returns `200` with a wrong number.

---

## Duplicate-Emission Check

Dart-only. The extension consumes `rowsAffected` and surfaces it in the cell-edit toast, so a wrong
value propagates to the user with no other signal.

---

## What I Already Tried

- [x] Confirmed `queryRaw` and `writeQuery` are independent constructor parameters, never asserted
      to share a connection
- [x] Confirmed the `await` between `writeQuery(sql)` and the probe yields the event loop
- [x] Found the same pattern in `mutation_tracker.dart:263` (`last_insert_rowid()` via `readQuery`)

---

## Regression Info

- Last working version:
- First broken version:
- What changed: the `rowsAffected` probe was added to address a silent-no-op report
      (`plans/history/2026.06/2026.06.12/full-codebase-audit-2026.06.12.md` H5); the fix used the
      wrong callback

---

## Root Cause

`queryRaw` was chosen to keep the probe out of the DVR/perf buffers, but that choice also changed
which connection the probe runs on. Keeping the probe off the instrumented path and keeping it on
the write connection are separable concerns; only the first was addressed.

**Proposed fix sketch:**

1. Extend `DriftDebugWriteQuery` (or add `DriftDebugWriteQueryWithCount`) so the host can return the
   affected-row count directly; fall back to the current behavior only when the host supplies the
   legacy signature.
2. Failing that, run the `changes()` probe through `writeQuery` on the same connection and have the
   write path return its rows — and serialize it with the write mutex proposed in
   `011_infra_edits_batch_transaction_race.md` so no other statement can land between them.
3. Apply the same treatment to `MutationTracker._captureAfterInsert` — `last_insert_rowid()` must be
   evaluated on the connection that performed the INSERT.
4. Correct the misleading comment at `cell_update_handler.dart:198-202`.
5. Add `test/cell_update_handler_test.dart` (none exists today — see
   `069_feature_test_coverage_write_and_security_paths.md`) with a fake whose read and write callbacks
   are distinct, asserting the reported count.

---

## Changes Made

<!-- Fill in when a fix is written. -->

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- Who is affected: hosts with split read/write executors always; all hosts under concurrency.
- What is blocked: the "did my edit apply?" feedback the probe was added to provide.
- Data risk: none — the write itself is correct; the reported outcome is not.
- Frequency: 100% for split-connection hosts; intermittent otherwise.
