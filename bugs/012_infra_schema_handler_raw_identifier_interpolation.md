# BUG: `schema_handler.dart` interpolates table/column identifiers raw into SQL, bypassing `ServerUtils.quoteIdent`

**Status: Open**

Created: 2026-09-02
Component: Server
File: `lib/src/server/schema_handler.dart` (lines 135, 148, 384, 408, 438, 524, 534, 542)
Severity: Crash

---

## Summary

`ServerUtils.quoteIdent` exists specifically because a legal SQLite identifier may contain a double
quote (`CREATE TABLE "a""b" …`), so interpolating a name as `"$name"` lets that quote break out of
the quoting — the identifier-injection hole closed by audit item H2. Every SQL-building site in the
server uses it (59 call sites) **except** `schema_handler.dart`, which builds seven queries by hand
with `"$tableName"` / `"$table"` / `"$k"`. `GET /api/schema/diagram`, `GET /api/schema/metadata`
and `GET /api/dump` therefore throw — or, in the dump's case, emit corrupted DDL — on any schema
containing such a name, and the dump path additionally builds attacker-influenced SQL text.

---

## Attribution Evidence

```bash
# Positive — the raw-interpolated identifier sites, all in ONE file
grep -arn '"\$tableName"\|"\$table"\|"\$k"' lib/src/server/ | grep -v 'not found\|WARNING\|capture failed\|is not in table\|Unknown column'
# lib/src/server/schema_handler.dart:135:        await query('PRAGMA table_info("$tableName")'),
# lib/src/server/schema_handler.dart:148:          'PRAGMA foreign_key_list("$tableName")',
# lib/src/server/schema_handler.dart:384:        await query('PRAGMA table_info("$tableName")'),
# lib/src/server/schema_handler.dart:408:            'FROM "$tableName"',
# lib/src/server/schema_handler.dart:438:            'PRAGMA foreign_key_list("$tableName")',
# lib/src/server/schema_handler.dart:524:      final dynamic raw = await query('SELECT * FROM "$table"');
# lib/src/server/schema_handler.dart:534:            final colList = keys.map((k) => '"$k"').join(', ');
# lib/src/server/schema_handler.dart:542:                'INSERT INTO "$table" '

# Contrast — the rest of the server routes every identifier through quoteIdent
grep -arn "quoteIdent(" lib/src/server/ | wc -l
# 59

# The helper that is being bypassed, and why it exists
grep -n "quoteIdent" -A 3 lib/src/server/server_utils.dart | sed -n '1,12p'
#   static String quoteIdent(String name) => '"${name.replaceAll('"', '""')}"';
#   (doc: "Every identifier interpolated into SQL must go through this. … a name is a legal
#    SQLite identifier even when it contains `"` … identifier injection / broken SQL.
#    See plans/history/2026.06/2026.06.12/full-codebase-audit-2026.06.12.md H2.")
```

**Emit site(s) — list ALL:** the eight lines above. Reached from `GET /api/schema/diagram`
(`router.dart:707`), `GET /api/schema/metadata` (`router.dart:757`), `GET /api/dump`
(`router.dart:765`), and the VM-service RPC `Router.getSchemaMetadataList` (`router.dart:1160`).
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
- Relevant non-default settings: none
- Other potentially conflicting extensions:

---

## Minimal Reproducible Example

```sql
CREATE TABLE "say""hi" (id INTEGER PRIMARY KEY, "we""ird" TEXT);
INSERT INTO "say""hi" VALUES (1, 'x');
```

```bash
curl -s http://127.0.0.1:8642/api/schema/metadata
```

`PRAGMA table_info("say"hi")` is sent — a syntax error. The handler's per-table work is not
individually guarded at line 384, so the whole request fails with a 500 and **every** table's
metadata is lost, not just the offending one.

```bash
curl -s http://127.0.0.1:8642/api/dump
```

emits `INSERT INTO "say"hi" ("id", "we"ird") VALUES (1, 'x');` — a dump that cannot be replayed.

A `"` in a column name is reachable without any DDL privileges wherever the app itself creates such
a column; combined with `002_infra_import_sql_format_executes_arbitrary_sql.md` (arbitrary `CREATE TABLE`
over HTTP) it is also remotely plantable, at which point line 542's `INSERT INTO "$table"` is
attacker-shaped SQL text handed to whoever replays the dump.

---

## Expected Behavior

Identical to every other handler: `ServerUtils.quoteIdent(tableName)` / `quoteIdent(columnName)` at
all eight sites, so an embedded `"` is doubled and the identifier stays inside its quoting.

---

## Actual Behavior

Raw interpolation. Requests fail with a SQLite syntax error, or produce a corrupt dump.

---

## Error Output

```
SqliteException(1): near "hi": syntax error, SQL logic error (code 1)
```

surfaced as a 500 from `Router._dispatch`'s outer catch.

---

## Duplicate-Emission Check

Dart-only. The TypeScript extension quotes identifiers in `extension/src/sql/blob-safe-select.ts`
(`grep -n 'replace(/"/g' extension/src/sql/blob-safe-select.ts` shows the doubling), so the TS path
is already correct — this is a one-sided Dart defect.

---

## What I Already Tried

- [x] Enumerated every `"$identifier"` interpolation in `lib/src/server/` and separated the SQL sites
      from the log/error-message sites
- [x] Confirmed the 59 other SQL-building sites all use `quoteIdent`
- [x] Confirmed the per-table loop at `schema_handler.dart:382` has no per-table try/catch, so one
      bad name fails the whole endpoint

---

## Regression Info

- Last working version: n/a
- First broken version:
- What changed: audit item H2 introduced `quoteIdent` and converted the call sites it found;
  `schema_handler.dart` was missed

---

## Root Cause

The H2 conversion pass did not cover this file. Nothing enforces the invariant, so the omission is
invisible.

**Proposed fix sketch:**

1. Replace all eight sites with `ServerUtils.quoteIdent(...)`.
2. Wrap the per-table body of `getSchemaMetadataList` and `getDiagramData` in a try/catch that logs
   and skips the offending table, so one pathological name degrades one row instead of the whole
   response.
3. Add a lint-style guard: a unit test that greps `lib/src/server/*.dart` for
   `'"\$` inside a string that also contains `SELECT|PRAGMA|INSERT|UPDATE|DELETE` and fails on any
   match — this invariant has now been broken twice and needs a mechanical check, not a convention.
4. Regression test in `test/schema_handler_test.dart` using a table named `say"hi` with a column
   named `we"ird`, asserting metadata, diagram, and dump all succeed and the dump round-trips.

---

## Changes Made

<!-- Fill in when a fix is written. -->

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- Who is affected: any schema with a `"` in a table or column name; any host reachable by
  `/api/import` with `format: "sql"`.
- What is blocked: schema metadata, the ER diagram, and the SQL dump — all three fail wholesale, not
  per-table.
- Data risk: a corrupt, non-replayable dump presented to the user as a valid backup; attacker-shaped
  SQL embedded in that dump.
- Frequency: deterministic once such a name exists.
