# BUG: New-row insert silently drops the primary key column, producing rows with a NULL PK on TEXT/composite keys

**Status: Open**

Created: 2026-09-02
Component: Extension
File: `extension/src/editing/sqlite-cell-value.ts` (line ~243), `extension/src/editing/sql-generator.ts` (line ~18)
Severity: Wrong fix

---

## Summary

`validateRowInsert` skips **every** column with `pk` set, on the assumption that a primary key is always an auto-populated `INTEGER PRIMARY KEY` rowid alias. For a TEXT/UUID primary key or a composite key it is not, and SQLite's long-standing quirk is that a non-INTEGER `PRIMARY KEY` column without an explicit `NOT NULL` **accepts NULL**. The generated `INSERT` therefore succeeds and stores a row with a NULL key, which no subsequent inline edit can repair - `parseCellEditForColumn` refuses to edit any `pk` column.

---

## Attribution Evidence

```bash
# Positive - the insert path IS here
grep -rn "validateRowInsert" extension/src/ | grep -v /test/
# extension/src/editing/sqlite-cell-value.ts:243:export function validateRowInsert(
# extension/src/editing/editing-bridge.ts:5:import { validateCellEdit, validateRowInsert } from './sqlite-cell-value';
# extension/src/editing/editing-bridge.ts:191:      const result = validateRowInsert(tables, msg.table, msg.values);

grep -rn "case 'insert'" extension/src/editing/sql-generator.ts
# extension/src/editing/sql-generator.ts:18:    case 'insert': {

grep -rn "validateRowInsert" lib/src/
# Expected: 0 matches (inline editing validation is TypeScript-only)

# Negative - not a sibling-repo rule
grep -rn "validateRowInsert" ../saropa_lints/lib/src/rules/
# Expected: 0 matches   (actual: 0 matches; ../saropa_lints/lib/src/rules/ exists, 21 entries)
```

**Emit site(s) - list ALL:**
- `extension/src/editing/sqlite-cell-value.ts:253-255` (the `if (col.pk) { continue; }` skip)
- `extension/src/editing/sql-generator.ts:18-25` (`INSERT INTO ... (cols) VALUES (...)` built from the surviving keys)

Reached from `EditingBridge._handleRowInsert` (`extension/src/editing/editing-bridge.ts:184-207`), i.e. the "add row" control in the data grid.

---

## Environment

- OS: Windows 11 Pro 10.0.22631
- VS Code version: any
- Extension version: 4.2.5
- Database type and version: SQLite 3.x (any)
- Connection method: local debug server
- Relevant non-default settings: write/editing enabled

---

## Steps to Reproduce

1. Table with a natural TEXT primary key - the shape the extension's own `text-pk` diagnostic exists to describe (`extension/src/diagnostics/checkers/pk-checker.ts:47`):

   ```sql
   CREATE TABLE devices (
     uuid  TEXT PRIMARY KEY,
     label TEXT NOT NULL
   );
   ```

2. Open the `devices` table in the data grid.
3. Click "add row", fill in `uuid` = `d1` and `label` = `Phone`.
4. Apply the pending change.

---

## Expected Behavior

Either

- the `uuid` value the user typed is included in the INSERT, or
- the edit is rejected with a message explaining that the table's primary key is not auto-generated and must be supplied.

---

## Actual Behavior

The `uuid` the user typed is discarded before the SQL is built. The applied statement is:

```sql
INSERT INTO "devices" ("label") VALUES ('Phone')
```

SQLite accepts it (a non-INTEGER PRIMARY KEY column is nullable unless declared `NOT NULL`), so the user sees a successful apply and a new row whose key is NULL:

```sql
SELECT quote(uuid), label FROM devices;
-- NULL|'Phone'
```

Because NULLs compare distinct in a UNIQUE index, repeating the operation adds a second NULL-keyed row rather than failing. The rows cannot then be corrected in place: `parseCellEditForColumn` returns `{ ok: false, message: 'Primary key cannot be edited inline.' }` for any `pk` column (`sqlite-cell-value.ts:166-168`), and `statementForChange`'s `DELETE`/`UPDATE` forms key on `pkColumn = <value>`, which cannot match NULL.

The composite-key case is worse, because *both* key parts are dropped:

```sql
CREATE TABLE memberships (
  user_id  INTEGER NOT NULL,
  group_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, group_id)
);
-- generated: INSERT INTO "memberships" () VALUES ()   -- syntactically invalid,
--            or, with any other column present, an insert missing both NOT NULL keys
--            -> "NOT NULL constraint failed: memberships.user_id"
```

so the same skip produces either invalid SQL or a hard constraint failure depending on the table's shape.

---

## Minimal Reproducible Example

Pure-function reproduction, no VS Code required:

```ts
const tables = [{
  name: 'devices',
  columns: [
    { name: 'uuid',  type: 'TEXT', pk: 1, notnull: 0 },
    { name: 'label', type: 'TEXT', pk: 0, notnull: 1 },
  ],
}];

validateRowInsert(tables, 'devices', { uuid: 'd1', label: 'Phone' });
// => { ok: true, values: { label: 'Phone' } }
//                          ^^^^^^^^^^^^^^ uuid silently gone

generateSqlStatements([{ kind: 'insert', table: 'devices', values: { label: 'Phone' } }]);
// => ['INSERT INTO "devices" ("label") VALUES (\'Phone\')']
```

---

## Root Cause

`sqlite-cell-value.ts:252-265`:

```ts
for (const col of table.columns) {
  if (col.pk) {
    continue;              // <-- "PK omitted for autoincrement" per the doc comment
  }
  ...
}
```

The doc comment on the function states the intent explicitly: "(non-PK columns only; PK omitted for autoincrement)". The condition tested is `col.pk`, but the condition that justifies omission is "this column is an INTEGER PRIMARY KEY rowid alias with no user-supplied value" - a strictly narrower set. `ColumnMetadata` carries `type` and `pk`, so the two are distinguishable at this point; only `pk` is consulted.

**Fix sketch**

1. Narrow the skip to the case it was written for, and only when the user supplied nothing:

   ```ts
   // Only an INTEGER PRIMARY KEY is a rowid alias that SQLite fills in. A TEXT
   // or composite key must come from the user - skipping it stores a NULL key
   // that no later inline edit can repair (PK cells are read-only).
   const isRowidAlias =
     col.pk && (col.type || '').toUpperCase() === 'INTEGER' && !isComposite;
   const supplied = Object.prototype.hasOwnProperty.call(values, col.name);
   if (isRowidAlias && !supplied) continue;
   ```

   where `isComposite` is `table.columns.filter((c) => c.pk).length > 1` (PRAGMA `table_info` numbers composite parts `pk = 1, 2, ...`, all truthy).
2. When a non-rowid key column is required but absent from `values`, return `{ ok: false, message: 'Column "<name>" is the primary key and must be supplied.' }` so `_handleRowInsert` shows the warning and calls `_postRowInsertRejected` - the existing rejection path already handles this cleanly.
3. Relax `parseCellEditForColumn`'s blanket "Primary key cannot be edited inline" for the *insert* path (it is validating a brand-new row, where there is no key to preserve), while keeping it for the cell-update path. Passing a `forInsert` flag is the smallest change; today `validateRowInsert` calls straight into it, so a supplied key would be rejected even after fix (1).
4. Tests: `extension/src/test/sqlite-cell-value.test.ts` has no TEXT-PK or composite-PK insert case. Add both, asserting the key survives (or the insert is rejected).

---

## Impact

- Who is affected: any user editing a table whose primary key is not `INTEGER ... AUTOINCREMENT` - UUID-keyed sync tables and join tables, both common.
- What is blocked: adding a row to such a table. The composite case fails loudly; the TEXT case fails silently, which is worse.
- Data risk: **yes** - rows with NULL primary keys are written to the user's real database, are not repairable through the extension's own UI (PK cells are read-only, and DELETE keys on `pkColumn = <value>` which never matches NULL), and break any Drift query that maps the key to a non-nullable Dart field.
- Frequency: every "add row" on such a table.
