# BUG: FTS5 shadow tables reported as `extra-table-in-db`

**Status: Open**

Created: 2026-09-02
Component: Extension
File: `extension/src/diagnostics/providers/schema-provider.ts` (line ~44), `extension/src/diagnostics/checkers/table-checker.ts` (line ~66)
Severity: False positive

---

## Summary

`SchemaProvider` filters only tables whose name starts with `sqlite_` out of `dbTableMap`. SQLite's FTS3/FTS4/FTS5 virtual tables materialise five or more real shadow tables that do **not** carry that prefix, and no Dart class declares them. Each one produces an `extra-table-in-db` diagnostic, so one FTS5 index yields six spurious findings.

---

## Attribution Evidence

```bash
# Positive — diagnostic IS defined here
grep -rn "'extra-table-in-db'" extension/src/
# extension/src/diagnostics/checkers/table-checker.ts:71:        code: 'extra-table-in-db',
# extension/src/diagnostics/codes/schema-codes.ts:95:  'extra-table-in-db': {
# extension/src/diagnostics/codes/schema-codes.ts:96:    code: 'extra-table-in-db',

grep -rn "'extra-table-in-db'" lib/src/
# Expected: 0 matches (TypeScript-only diagnostic)

# No FTS/virtual-table handling exists anywhere in either tree
grep -rniE "fts5?|virtual table" --include=*.ts --include=*.dart extension/src lib/src | grep -v test
# Expected: 0 relevant matches (actual: only unrelated substring hits on "drafts"/"driftSize")

# Negative — not a sibling-repo rule
grep -rn "'extra-table-in-db'" ../saropa_lints/lib/src/rules/
# Expected: 0 matches   (actual: 0 matches; ../saropa_lints/lib/src/rules/ exists, 21 entries)
```

**Emit site(s) — list ALL:** `extension/src/diagnostics/checkers/table-checker.ts:70`
**Diagnostic `source` / `owner` as seen in Problems panel:** `drift-advisor`

---

## Environment

- OS: Windows 11 Pro 10.0.22631
- Extension version: 4.2.5
- Database type and version: SQLite 3.39+ with FTS5 (bundled `sqlite3_flutter_libs`)
- Connection method: local debug server
- Relevant non-default settings: none

---

## Steps to Reproduce

1. Declare an FTS5 index in a `.drift` file (the documented Drift way to get full-text search):
   ```sql
   CREATE VIRTUAL TABLE notes_fts USING fts5(body, content=notes, content_rowid=id);
   ```
2. Run the app so the migration executes.
3. Connect the extension and open a Dart file that declares tables.

---

## Expected Behavior

No diagnostics. The shadow tables are engine-owned storage for `notes_fts`; there is no Dart class to write for them and nothing the developer can do.

---

## Actual Behavior

Six `extra-table-in-db` Information diagnostics, all anchored to line 0 of the workspace's largest schema file:

```
drift-advisor Table "notes_fts" exists in database but not in Dart
drift-advisor Table "notes_fts_data" exists in database but not in Dart
drift-advisor Table "notes_fts_idx" exists in database but not in Dart
drift-advisor Table "notes_fts_content" exists in database but not in Dart
drift-advisor Table "notes_fts_docsize" exists in database but not in Dart
drift-advisor Table "notes_fts_config" exists in database but not in Dart
```

---

## Minimal Reproducible Example

After the `CREATE VIRTUAL TABLE` above, `sqlite_master` contains:

```sql
SELECT name, type FROM sqlite_master WHERE name LIKE 'notes_fts%' ORDER BY name;
-- notes_fts          table   (the virtual table itself)
-- notes_fts_config   table
-- notes_fts_content  table
-- notes_fts_data     table
-- notes_fts_docsize  table
-- notes_fts_idx      table
```

The provider's filter (`schema-provider.ts:43-51`):

```ts
for (const t of dbSchema) {
  if (!t.name.startsWith('sqlite_')) {   // <-- only guard
    dbTableMap.set(t.name, t);
    ...
  }
}
```

None of the six names starts with `sqlite_`, so all six reach `checkExtraTablesInDb`, and none is in `dartTableNames` / `dartNormalizedNames`.

The same hole admits `android_metadata` (created by the Android platform SQLite wrapper) and any `*_old` / backup table left behind by a table-recreation migration.

---

## Root Cause

The exclusion list encodes one assumption — "system tables are prefixed `sqlite_`" — which is true for `sqlite_sequence`, `sqlite_stat1`, `sqlite_autoindex_*` and false for every virtual-table shadow table. SQLite exposes the correct signal but the extension does not consume it: `sqlite_master.type` is `'table'` for shadow tables, but the parent virtual table's row has `sql` beginning `CREATE VIRTUAL TABLE`, and `PRAGMA table_list` (3.37+) reports shadow tables with `type = 'shadow'`.

**Fix sketch**

1. Have the server's schema endpoint report the virtual/shadow classification (either `PRAGMA table_list`'s `type` column, or by parsing `sqlite_master.sql` for `CREATE VIRTUAL TABLE` and deriving the `<name>_%` shadow prefixes). Add an optional `kind?: 'table' | 'view' | 'virtual' | 'shadow'` to `TableMetadata` in `extension/src/api-types.ts`.
2. In `schema-provider.ts`, exclude anything not `kind === 'table'` from `dbTableMap`, keeping the `sqlite_` prefix check as the fallback for older servers.
3. As a server-independent stopgap, derive the shadow set client-side: for every DB table whose name matches `^(.*)_(data|idx|content|docsize|config|segments|segdir|stat|docsize)$` where the prefix group is itself a known DB table, treat it as engine-owned.
4. Also add `android_metadata` to the ignore set.
5. Test: extend `extension/src/test/table-checker.test.ts` with a `dbTableMap` containing the six names above and assert zero issues.

---

## Impact

- Who is affected: every project using Drift's documented FTS5 support, and every Android project whose SQLite wrapper creates `android_metadata`.
- What is blocked: nothing hard, but six permanent unfixable Information diagnostics per FTS index anchored at line 0 of the user's main schema file, where they cannot be suppressed with an inline directive targeting a meaningful line.
- Data risk: none.
- Frequency: every refresh.
