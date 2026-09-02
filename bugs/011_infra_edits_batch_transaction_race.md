# BUG: Concurrent `/api/edits/apply` requests corrupt each other's transaction — one request's ROLLBACK discards another's committed work

**Status: Open**

Created: 2026-09-02
Component: Server
File: `lib/src/server/edits_batch_handler.dart` (lines ~66-100)
Severity: Crash

---

## Summary

`EditsBatchHandler.runValidatedBatchStatements` frames its work with raw
`BEGIN IMMEDIATE;` / `COMMIT;` / `ROLLBACK;` statements sent through `writeQuery`, with **no
serialization**. Dart's `HttpServer` dispatches requests concurrently, so two overlapping
`POST /api/edits/apply` calls (or one batch overlapping a `/api/cell/update`, `/api/import`, or
`/api/indexes/apply`) interleave on the same SQLite connection. The second `BEGIN IMMEDIATE` throws
"cannot start a transaction within a transaction", and its `catch` block then issues a bare
`ROLLBACK;` — which rolls back the **first** request's still-open transaction. The first request
subsequently reports success while its writes are gone.

---

## Attribution Evidence

```bash
# Positive — the transaction framing lives here, and nowhere else in the Dart tree
grep -rn "BEGIN IMMEDIATE\|COMMIT\|ROLLBACK" lib/src/
# lib/src/drift_debug_server_io.dart:373:        // e.g. the batch handler's BEGIN/COMMIT framing, or quoting shapes
# lib/src/server/edits_batch_handler.dart:69:      await writeQuery('BEGIN IMMEDIATE;');
# lib/src/server/edits_batch_handler.dart:90:      await writeQuery('COMMIT;');
# lib/src/server/edits_batch_handler.dart:93:        await writeQuery('ROLLBACK;');
# lib/src/server/table_activity_tracker.dart:121:  /// anything else (DDL, PRAGMA, BEGIN/COMMIT framing) records nothing —

# Negative — no mutex / lock / write chain guards the write path
grep -rn "Lock\b\|Mutex\|synchronized\|_writeChain\|Completer<void> _write" lib/src/server/
# (0 matches)
```

**Emit site(s) — list ALL:** `lib/src/server/edits_batch_handler.dart:69`, `:90`, `:93`. Reached
from `POST /api/edits/apply` (`lib/src/server/router.dart:1010`) and from the VM-service RPC
`Router.applyEditsBatchStatements` (`lib/src/server/router.dart:1195`), which is a **second
concurrent entry point into the same unguarded code**.
**Diagnostic `source` / `owner` as seen in Problems panel:** n/a (runtime server behavior).

---

## Environment

- OS:
- VS Code version:
- Extension version:
- Dart SDK version:
- Flutter SDK version (if applicable):
- Database type and version: SQLite (any)
- Connection method: HTTP loopback and/or VM service
- Relevant non-default settings: `writeQuery` supplied
- Other potentially conflicting extensions:

---

## Steps to Reproduce

1. Start the server with `writeQuery` wired and a table `t(id INTEGER PRIMARY KEY, v INTEGER)`
   holding one row `(1, 0)`.
2. Fire two batch applies at the same time, each with enough statements that the first is still
   inside its loop when the second arrives (500 statements is the allowed maximum):

```bash
curl -s -X POST http://127.0.0.1:8642/api/edits/apply -H 'Content-Type: application/json' \
  -d "{\"statements\":[$(python -c "print(','.join(['\"UPDATE t SET v = v + 1 WHERE id = 1\"']*500))")]}" &
curl -s -X POST http://127.0.0.1:8642/api/edits/apply -H 'Content-Type: application/json' \
  -d '{"statements":["UPDATE t SET v = 999 WHERE id = 1"]}' &
wait
```

3. `SELECT v FROM t` — the value is neither 500 nor 999 with any consistency across runs.

This is intermittent by nature; it reproduces reliably when the two requests overlap, which the
500-statement batch makes near-certain.

---

## Expected Behavior

Batch apply is documented as all-or-nothing. Two concurrent batches should serialize: the second
waits for the first to commit or roll back, and each observes exactly its own transaction.

---

## Actual Behavior

Transactions interleave on the shared connection. Observed failure modes:

- Second `BEGIN IMMEDIATE` throws → its `catch` runs `ROLLBACK;` → the **first** batch's uncommitted
  work is discarded, yet the first batch's subsequent `COMMIT;` either throws (no transaction) or
  silently commits nothing, and the handler still returns `{"ok": true, "count": N}`.
- A `/api/cell/update` or `/api/import` write that lands between `BEGIN IMMEDIATE` and `COMMIT` is
  silently swept into the batch transaction and rolled back with it.

---

## Error Output

`SqliteException(1): cannot start a transaction within a transaction` appears in the host's
`onError` sink for the losing request; the winning request logs nothing and reports success.

---

## Duplicate-Emission Check

Dart-only. The extension issues the HTTP call but does not own the transaction framing.

---

## What I Already Tried

- [x] Grepped the whole Dart tree for any lock/mutex/serialization primitive — none exists
- [x] Confirmed both HTTP and VM-service entry points call the same unguarded method
- [x] Confirmed `runValidatedBatchStatements` catches *any* error and unconditionally emits
      `ROLLBACK;`, including when the failure was "already in a transaction"

---

## Regression Info

- Last working version: n/a — never serialized
- First broken version:
- What changed:

---

## Root Cause

The handler assumes exclusive use of the write connection but nothing enforces it, and the recovery
path (`ROLLBACK;` on any error) is not scoped to the transaction this request actually opened.

**Proposed fix sketch:**

1. Add a single-slot async mutex on `ServerContext` — a `Future<void> _writeChain` that every write
   path (`edits_batch_handler`, `cell_update_handler`, `import_handler`, `index_batch_handler`)
   appends to, exactly as `ServerContext._snapshotPersistChain` already does for snapshot
   persistence. That pattern is already in the codebase and proven.
2. Only emit `ROLLBACK;` when this request's `BEGIN IMMEDIATE;` actually succeeded — track it with a
   local `var opened = false;` set after the BEGIN returns.
3. Do not report `{"ok": true}` when `COMMIT;` threw; today the `COMMIT` is inside the guarded block
   so a throw is rethrown, but a *silent* no-op commit after someone else's rollback is not
   detectable — surface `changes()`/statement counts instead.
4. Regression test: two overlapping `runValidatedBatchStatements` futures on a shared fake
   `writeQuery` that records the statement order; assert no `BEGIN` appears between another
   request's `BEGIN` and its `COMMIT`.

---

## Changes Made

<!-- Fill in when a fix is written. -->

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- Who is affected: any host with `writeQuery` wired where more than one client (VS Code extension +
  browser viewer, or two browser tabs) can apply edits.
- What is blocked: the all-or-nothing guarantee the endpoint documents.
- Data risk: **silent loss of committed edits** and silent inclusion of unrelated writes in a
  rolled-back transaction. The success envelope is returned either way, so the user has no signal.
- Frequency: intermittent; proportional to client concurrency and batch size.
