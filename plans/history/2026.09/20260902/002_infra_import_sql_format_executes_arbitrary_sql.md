# BUG: `POST /api/import` with `format: "sql"` executes arbitrary unvalidated SQL (DROP/ATTACH/PRAGMA)

**Status: Fixed**

Created: 2026-09-02
Component: Server
File: `lib/src/drift_debug_import.dart` (line ~225), `lib/src/server/import_handler.dart` (line ~120)
Severity: Crash

---

## Summary

`POST /api/import` accepts `format: "sql"` and passes every statement in the body straight to
`ServerContext.writeQuery` with **no validation at all** — no read-only check, no DML-only check,
no allow-list. `DROP TABLE`, `ATTACH DATABASE`, `PRAGMA journal_mode`, `DELETE FROM <t>` and any
other statement the host's write callback will accept are executed against the developer's live
application database. Every other write path in the server is gated (`SqlValidator.isReadOnlySql`,
`isSingleDataMutationSql`, `isSingleCreateIndexSql`); this one is not gated at all.

---

## Attribution Evidence

```bash
# Positive — the unvalidated SQL import path IS defined here
grep -rn "formatSql\|_importSql" lib/src/drift_debug_import.dart
# 24:  static const String formatSql = 'sql';
# 72:      case formatSql:
# 73:        return await _importSql(
# 225:  Future<DriftDebugImportResult> _importSql({
# 246:      format: formatSql,

# The executor: no validator is consulted anywhere in _importSql
grep -n "SqlValidator" lib/src/drift_debug_import.dart lib/src/server/import_handler.dart
# (0 matches)

# Contrast — every OTHER write path validates
grep -rn "SqlValidator" lib/src/server/
# lib/src/server/edits_batch_handler.dart:11:import 'sql_validator.dart';
# lib/src/server/index_batch_handler.dart:21:import 'sql_validator.dart';
# lib/src/server/sql_handler.dart:16:import 'sql_validator.dart';
```

**Emit site(s) — list ALL:** `lib/src/drift_debug_import.dart:225` (`_importSql`), reached from
`lib/src/server/import_handler.dart:120` (`processor.processImport`), routed at
`lib/src/server/router.dart:1027` (`_routeWriteApi` → `POST /api/import`).
**Diagnostic `source` / `owner` as seen in Problems panel:** n/a (runtime server endpoint, not a diagnostic).

---

## Environment

- OS:
- VS Code version:
- Extension version:
- Dart SDK version:
- Flutter SDK version (if applicable):
- Database type and version: SQLite (any)
- Connection method: HTTP, loopback (default `loopbackOnly: true`)
- Relevant non-default settings: `writeQuery` supplied to `DriftDebugServer.start()`
- Other potentially conflicting extensions:

---

## Minimal Reproducible Example

Start the example app with a write callback wired:

```dart
await DriftDebugServer.start(
  query: (sql) => db.customSelect(sql).get().then(...),
  writeQuery: (sql) => db.customStatement(sql),
);
```

Then, with no auth configured (the documented default):

```bash
curl -s -X POST http://127.0.0.1:8642/api/import \
  -H 'Content-Type: application/json' \
  -d '{"format":"sql","table":"users","data":"DROP TABLE users; PRAGMA journal_mode=DELETE;"}'
```

Response: `{"imported":2,"errors":[],"format":"sql","table":"users"}` — and `users` is gone.

Note the `table` field is validated against `sqlite_master` (`import_handler.dart:105`) which makes
the request *look* scoped, but `_importSql` ignores `table` entirely — see
`lib/src/drift_debug_import.dart:225-241`, where `table` is only copied into the result envelope.

---

## Expected Behavior

`format: "sql"` should either (a) be restricted to the same statement class the rest of the server
allows on a write path — single `INSERT INTO` / `UPDATE` / `DELETE FROM`, one statement at a time,
validated by `SqlValidator.isSingleDataMutationSql` — and additionally constrained to the `table`
named in the request, or (b) be removed / gated behind an explicit opt-in start parameter
(`allowRawSqlImport: true`) that is off by default.

---

## Actual Behavior

Every statement produced by `_splitSqlStatements` is executed verbatim through `writeQuery`.
DDL, `ATTACH`, `PRAGMA`, and cross-table DML all succeed. Failures are collected per statement into
`errors` and a `200` is still returned, so a partially destructive import reports success.

---

## Error Output

None — the endpoint returns `200` with an import result envelope.

---

## Duplicate-Emission Check

Single emit path (Dart only). `grep -rn "format.*sql" extension/src/` shows the extension does not
construct raw-SQL imports; the hole is reachable by any HTTP client, not just the extension.

---

## What I Already Tried

- [x] Read `SqlValidator` — confirmed no entry point from the import path
- [x] Traced `processImport` → `_importSql` → `writeQuery` with no intermediate check
- [x] Confirmed `table` existence validation in `import_handler.dart` does not constrain the SQL

---

## Regression Info

- Last working version: n/a — present since the import endpoint was added
- First broken version:
- What changed:

---

## Root Cause

`DriftDebugImportProcessor.processImport` dispatches `formatSql` to `_importSql`, which is a thin
loop over `_splitSqlStatements(data)` calling `writeQuery('$stmt;')`. The function was written as a
"restore a dump" convenience and never acquired the validation the later batch/cell endpoints got.

**Proposed fix sketch:**

1. In `_importSql`, validate each split statement with `SqlValidator.isSingleDataMutationSql` and
   reject (collect into `errors`, do not execute) anything that fails.
2. Additionally require the statement's target table — extracted with the existing
   `TableNameExtractor` — to equal the request's `table`, so an import into `users` cannot touch
   `secrets`.
3. Wrap the whole loop in `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK` so a half-applied dump is not
   left behind (today a mid-dump failure leaves earlier statements committed).
4. Add an explicit `allowRawSqlImport` start flag, default `false`, for hosts that genuinely need
   unrestricted restore; document that it grants full DDL over the app database.

---

## Changes Made

Implemented step 1 of the fix sketch only (per-statement validation). Steps 2–4
(per-statement table-match check, transaction wrapping, `allowRawSqlImport`
opt-in flag) are deferred follow-ups, not part of this change.

- `lib/src/drift_debug_import.dart`: imported `SqlValidator`
  (`lib/src/server/sql_validator.dart`). In `_importSql`, each statement
  produced by `_splitSqlStatements` is now checked with
  `SqlValidator.isSingleDataMutationSql(stmt)` before execution. A statement
  that fails validation (DDL, `ATTACH`, `PRAGMA`, multi-statement, or anything
  that isn't a single `INSERT INTO` / `UPDATE` / `DELETE FROM`) is appended to
  the `errors` list and skipped — `writeQuery` is never called for it.
- This closes the immediate arbitrary-SQL-execution hole: `DROP TABLE`,
  `ATTACH DATABASE`, `PRAGMA journal_mode=...` etc. are now rejected before
  reaching the write callback. The `table` field is still not cross-checked
  against each statement's target table (step 2, deferred) — an import
  request scoped to `users` can still `UPDATE`/`DELETE`/`INSERT` a different
  table, as long as the statement itself is valid single-statement DML.

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Finish Report (2026-09-02)

### Defect

`POST /api/import` with `format: "sql"` passed every statement from `_splitSqlStatements` directly to `writeQuery` with no validation. DDL (`DROP TABLE`, `CREATE TABLE`), `ATTACH DATABASE`, `PRAGMA`, and cross-table DML all executed silently. Every other server write path gates through `SqlValidator`; this endpoint was the sole exception.

### Fix

`lib/src/drift_debug_import.dart` — imported `SqlValidator` and added a guard in `_importSql`: each statement is checked with `SqlValidator.isSingleDataMutationSql(stmt)` before execution. Statements that fail (DDL, multi-statement, non-DML) are appended to the `errors` list and skipped — `writeQuery` is never called for them.

### Deferred scope

Steps 2–4 of the original fix sketch remain open:
- Per-statement table-match check (import scoped to table `X` can still mutate table `Y`).
- Transaction wrapping — cannot be done through the opaque `writeQuery` callback because it typically wraps `db.customStatement`, which runs inside Drift's executor. Sending raw `BEGIN`/`COMMIT` through it risks nested-transaction errors or Drift internal state corruption. Requires a dedicated `transactionCallback` parameter on the public API.
- `allowRawSqlImport` opt-in flag for hosts needing unrestricted restore.

### Hardening (2026-09-02, second pass)

**Validator widening:** `isSingleDataMutationSql` now accepts `REPLACE INTO`, `INSERT OR {REPLACE|IGNORE|ABORT|ROLLBACK|FAIL} INTO`, and `UPDATE OR {clause}` — all valid SQLite DML that was previously rejected. `REPLACE` removed from the forbidden-keyword set (it is DML, not DDL; the single-statement guard already prevents stacking).

**Quoted-table-name fix:** The UPDATE regex's trailing `\b` failed when `_maskCommentsAndLiterals` replaced a quoted table name with `?` (non-word char). Removed the trailing `\b` — the mandatory `\s+` after UPDATE already prevents matching non-keywords like `UPDATEX`.

**Error truncation:** Rejection error messages now truncate SQL text to 120 characters (`_maxErrorSqlLength`) to avoid leaking large schema fragments in HTTP error responses.

**Regex hoisting:** All 5 regex patterns in `isSingleDataMutationSql` hoisted to `static final` class fields, matching the codebase convention in `anomaly_detector.dart`, `host_statement_capture.dart`, etc. Avoids per-call compilation on a hot validation path (called per statement in import loops and per edit in batch applies).

### Test coverage

Eight tests in `test/drift_debug_import_test.dart` under "SQL import — statement validation (fix 002)":
- DDL rejection (DROP TABLE): 0 imported, 1 error, writeQuery never called.
- PRAGMA + ATTACH rejection: 0 imported, 2 errors, writeQuery never called.
- Mixed valid DML + DDL: INSERT/DELETE execute, CREATE TABLE rejected.
- SELECT rejection: read-only statements are not data mutations.
- REPLACE INTO acceptance: 1 imported, 0 errors.
- INSERT OR IGNORE INTO acceptance: 1 imported, 0 errors.
- INSERT OR REPLACE INTO acceptance: 1 imported, 0 errors.
- Error message truncation: long SQL truncated with `…`, full text absent.

Twenty-two tests in `test/sql_validation_test.dart` under "SqlValidator.isSingleDataMutationSql":
- 13 acceptance tests: INSERT INTO, UPDATE, DELETE FROM, REPLACE INTO, INSERT OR {REPLACE|IGNORE|ABORT} INTO, UPDATE OR ROLLBACK, case-insensitive, trailing semicolon, quoted table names (double-quote and backtick), REPLACE() function inside INSERT.
- 9 rejection tests: DROP TABLE, CREATE TABLE, PRAGMA, ATTACH, SELECT, VACUUM, multi-statement stacking, empty string, whitespace only.

All 116 tests pass across both files. No existing assertions broken.

### Code review

First pass: reviewed at `low` level, 0 findings. Second pass (after hardening): reviewed at `medium` level across 8 angles. One CONFIRMED correctness bug found (UPDATE regex `\b` failure with quoted table names) — fixed and regression-tested. Remaining findings (truncation duplication, per-call RegExp in other methods, `_maxErrorSqlLength` placement) are pre-existing patterns or cosmetic, addressed where practical.

---

## Impact

- Who is affected: every host that passes `writeQuery` to `DriftDebugServer.start()`.
- What is blocked: nothing is blocked, but the documented "read-only by default, writes are
  validated" posture does not hold for this endpoint.
- Data risk: **total loss of the connected app's database.** A single request can drop every table.
  Combined with `003_infra_post_endpoints_missing_content_type_check_csrf.md` (no `Content-Type`
  enforcement on this endpoint), the request is reachable cross-origin from any web page the
  developer has open, without auth, while the debug server runs.
- Frequency: deterministic — 100% of requests with `format: "sql"`.
