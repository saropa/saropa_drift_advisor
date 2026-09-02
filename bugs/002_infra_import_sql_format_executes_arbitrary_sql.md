# BUG: `POST /api/import` with `format: "sql"` executes arbitrary unvalidated SQL (DROP/ATTACH/PRAGMA)

**Status: Open**

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

<!-- Fill in when a fix is written. -->

---

## Commits

<!-- Add commit hashes as fixes land. -->

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
