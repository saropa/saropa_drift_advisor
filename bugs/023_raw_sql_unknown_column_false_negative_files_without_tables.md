# BUG: Raw-SQL column validation never runs on DAO/repository files, which is where raw SQL lives

**Status: Open**

Created: 2026-09-02
Component: Extension
File: `extension/src/diagnostics/dart-file-parser.ts` (line ~68), `extension/src/diagnostics/providers/schema-provider.ts` (line ~84)
Severity: False negative

---

## Summary

`parseDartFilesInWorkspace` only keeps a Dart file in the diagnostic context when it defines at least one Drift table class (`if (tables.length > 0)`). `checkRawSqlColumns` iterates that same filtered list, so a `customSelect` written in a DAO, repository, or service file — the overwhelmingly common location — is never scanned. The `raw-sql-unknown-column` diagnostic only fires when the raw SQL happens to sit in the same file as a table definition.

---

## Attribution Evidence

```bash
# Positive — diagnostic IS defined here
grep -rn "'raw-sql-unknown-column'" extension/src/
# extension/src/diagnostics/checkers/raw-sql-column-checker.ts:106:      code: 'raw-sql-unknown-column',
# extension/src/diagnostics/codes/schema-codes.ts:78:  'raw-sql-unknown-column': {
# extension/src/diagnostics/codes/schema-codes.ts:79:    code: 'raw-sql-unknown-column',

grep -rn "'raw-sql-unknown-column'" lib/src/
# Expected: 0 matches (TypeScript-only diagnostic)

# Negative — not a sibling-repo rule
grep -rn "'raw-sql-unknown-column'" ../saropa_lints/lib/src/rules/
# Expected: 0 matches   (actual: 0 matches; ../saropa_lints/lib/src/rules/ exists, 21 entries)
```

**Emit site(s) — list ALL:** `extension/src/diagnostics/checkers/raw-sql-column-checker.ts:105`
**Diagnostic `source` / `owner` as seen in Problems panel:** `drift-advisor`

---

## Environment

- OS: Windows 11 Pro 10.0.22631
- Extension version: 4.2.5
- Database type and version: SQLite (Drift)
- Connection method: local debug server
- Relevant non-default settings: none

---

## Steps to Reproduce

1. `lib/db/tables.dart` — table definitions only:
   ```dart
   class Contacts extends Table {
     IntColumn get id => integer().autoIncrement()();
     TextColumn get displayName => text()();
   }
   ```
2. `lib/db/contacts_dao.dart` — no table class, raw SQL with a genuinely wrong column:
   ```dart
   @DriftAccessor(tables: [Contacts])
   class ContactsDao extends DatabaseAccessor<AppDb> with _$ContactsDaoMixin {
     ContactsDao(super.db);
     Future<List<QueryRow>> all() =>
         customSelect('SELECT dispaly_name FROM contacts').get();
   }
   ```
   (`dispaly_name` is a typo — the real column is `display_name`.)
3. Connect to a running debug server and refresh diagnostics.

---

## Expected Behavior

A Warning on `dispaly_name` in `contacts_dao.dart`:

> Column "dispaly_name" not found in table "contacts". Did you mean "display_name"? ...

This is exactly the runtime `SqliteException(1): no such column` the checker's own header comment says it exists to prevent shipping.

---

## Actual Behavior

No diagnostic. Moving the identical `customSelect` into `tables.dart` (next to the table class) makes it fire immediately — which is the proof that the gate, not the parser, is the cause.

---

## Minimal Reproducible Example

The two files above. The only difference between "fires" and "does not fire" is whether the enclosing file contains a `class X extends Table`.

Code path:

```ts
// dart-file-parser.ts:66-75
const tables = parseDartTables(text, uri.toString());
if (tables.length > 0) {          // <-- gate
  files.push({ uri, text, tables, suppressions: ... });
}
```

```ts
// schema-provider.ts:59-86
for (const file of ctx.dartFiles) {   // <-- only table-defining files
  ...
  if (!dbIsEmpty) {
    checkRawSqlColumns(issues, file, dbTableMap, dbNormalizedMap);
  }
}
```

`checkRawSqlColumns` itself is correct: it takes `file.text` and needs no table metadata from that file (`raw-sql-column-checker.ts:52-58`).

---

## Root Cause

Two different consumers share one filtered file list with incompatible requirements:

- Schema/naming/PK checks are table-scoped and genuinely need `tables.length > 0`.
- Raw-SQL validation is text-scoped and needs the opposite: every Dart file.

The `tables.length > 0` filter was the right shape when `IDartFileInfo` only fed the table-scoped checks; `checkRawSqlColumns` was added onto the same list and silently inherited the filter.

**Fix sketch**

1. Keep files with `tables.length > 0` **or** a raw-SQL call. Cheapest form — reuse the parser's own call regex rather than a second scan:
   ```ts
   const RAW_SQL_CALL = /\b(?:customSelect|customStatement)\s*\(/;
   if (tables.length > 0 || RAW_SQL_CALL.test(text)) { files.push(...); }
   ```
   Every table-scoped loop already iterates `file.tables`, so a file with zero tables contributes nothing to them and needs no further guarding.
2. Add a `hasTables` or equivalent so `checkExtraTablesInDb`'s "file with the most tables" target selection (`table-checker.ts:62`) is unaffected — it uses `reduce` on `tables.length`, so a zero-table file can never win, and no change is needed there.
3. Test: extend `extension/src/test/raw-sql-column-checker.test.ts` with a fixture whose `IDartFileInfo.tables` is empty, asserting the issue still fires.

---

## Impact

- Who is affected: every project that follows the standard Drift layout (tables in one file, `@DriftAccessor` DAOs in another).
- What is blocked: the diagnostic's entire stated purpose. The class of bug it targets — a raw-SQL column typo that only surfaces at runtime — is precisely the class that lives in DAO files.
- Data risk: none directly.
- Frequency: always, for the standard layout.
