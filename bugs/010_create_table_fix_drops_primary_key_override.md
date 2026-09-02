# BUG: Generated `CREATE TABLE` migration silently drops the table's primary key when it comes from a `primaryKey` override

**Status: Open**

Created: 2026-09-02
Component: Extension
File: `extension/src/migration-gen/migration-codegen.ts` (line ~82, ~175), `extension/src/schema-diff/dart-schema.ts` (line ~39)
Severity: Wrong fix

---

## Summary

`dartColToDef` derives a column's primary-key flag from `c.autoIncrement`. Drift's other two ways of declaring a primary key - the `@override Set<Column> get primaryKey => {...}` getter and a composite key - are never parsed into `IDartTable`, so for any table that uses them `dartColToDef` marks every column `pk: false`. The generated `CREATE TABLE` then has **no PRIMARY KEY clause at all**, producing a table with different semantics from the Dart definition (duplicate keys accepted, no implicit unique index, Drift's `replace`/`deleteOne` no longer able to identify a row).

---

## Attribution Evidence

```bash
# Positive - the generator IS here
grep -rn "dartColToDef\|generateCreateTable" extension/src/ | grep -v /test/
# extension/src/migration-gen/migration-codegen.ts:52:      columns: table.columns.map(dartColToDef),
# extension/src/migration-gen/migration-codegen.ts:82:function dartColToDef(c: IDartColumn): IColumnDef {
# extension/src/migration-gen/migration-codegen.ts:163:      return generateCreateTable(action);
# extension/src/migration-gen/migration-codegen.ts:175:function generateCreateTable(action: IMigrationAction): string[] {

# The parsed model has no primary-key concept at all
grep -n "primaryKey" extension/src/schema-diff/dart-schema.ts extension/src/schema-diff/dart-parser.ts
# Expected: 0 matches (actual: 0 matches - IDartTable has dartClassName, sqlTableName,
#           columns, indexes, uniqueKeys, fileUri, line; no primaryKey field)

grep -rn "generateCreateTable" lib/src/
# Expected: 0 matches (migration generation is TypeScript-only)

# Negative - not a sibling-repo rule
grep -rn "generateCreateTable\|dartColToDef" ../saropa_lints/lib/src/rules/
# Expected: 0 matches   (actual: 0 matches; ../saropa_lints/lib/src/rules/ exists, 21 entries)
```

**Emit site(s) - list ALL:** `extension/src/migration-gen/migration-codegen.ts:185-192` (reached from `generateMigrationDart` -> `diffToActions` -> `generateCreateTable`)
**Reached from:** the `Generate Migration` quick fix on `missing-table-in-db` (`extension/src/diagnostics/providers/schema-provider.ts:142-155`).

---

## Environment

- OS: Windows 11 Pro 10.0.22631
- VS Code version: any
- Extension version: 4.2.5
- Database type and version: SQLite (Drift 2.x)
- Connection method: local debug server
- Relevant non-default settings: none

---

## Steps to Reproduce

1. Declare a table whose primary key is a `primaryKey` override rather than `autoIncrement()` - the standard Drift idiom for a natural or composite key:

   ```dart
   class Memberships extends Table {
     IntColumn get userId => integer()();
     IntColumn get groupId => integer()();
     DateTimeColumn get joinedAt => dateTime()();

     @override
     Set<Column> get primaryKey => {userId, groupId};
   }
   ```

2. Do not run the app, so the table does not exist in the database yet. Connect the extension; `missing-table-in-db` fires on `Memberships`.
3. Invoke the `Generate Migration` quick fix.

---

## Expected Behavior

```dart
await customStatement('''
  CREATE TABLE "memberships" (
    "user_id" INTEGER NOT NULL,
    "group_id" INTEGER NOT NULL,
    "joined_at" INTEGER NOT NULL,
    PRIMARY KEY ("user_id", "group_id")
  )
''');
```

Or, at minimum, a refusal plus an explanatory comment - anything except silently emitting a structurally different table.

---

## Actual Behavior

```dart
// New table: memberships
await customStatement('''
  CREATE TABLE "memberships" (
    "user_id" INTEGER NOT NULL,
    "group_id" INTEGER NOT NULL,
    "joined_at" INTEGER NOT NULL
  )
''');
```

No `PRIMARY KEY`. The table now:

- accepts duplicate `(user_id, group_id)` pairs;
- has no implicit unique index, so the joins Drift generates against it lose their index;
- diverges from what `drift_dev` would have created, so a later `Migrator.createAll()` or schema verification disagrees with the live schema.

The extension's own `no-primary-key` diagnostic (`extension/src/diagnostics/checkers/pk-checker.ts:24`) will then fire on the table the extension itself created.

---

## Minimal Reproducible Example

Pure-function reproduction:

```ts
// parseDartTables() on the Dart above yields (dart-schema.ts IDartColumn shape):
//   { dartName: 'userId',  sqlName: 'user_id',  dartType: 'IntColumn',
//     sqlType: 'INTEGER', nullable: false, autoIncrement: false, line: 1 }
//   { dartName: 'groupId', sqlName: 'group_id', ... autoIncrement: false }
//   { dartName: 'joinedAt',sqlName: 'joined_at',... autoIncrement: false }
// There is no primaryKey information anywhere in IDartTable.

dartColToDef(cols[0])
// => { name: 'user_id', sqlType: 'INTEGER', pk: false, nullable: false, autoIncrement: false }
//                                            ^^^^^^^^ derived solely from autoIncrement
```

`generateCreateTable` (`migration-codegen.ts:177-183`) only ever emits `PRIMARY KEY` when `c.pk` is true, so no column contributes one.

The single-column non-autoincrement case fails the same way:

```dart
class Devices extends Table {
  TextColumn get uuid => text()();
  @override
  Set<Column> get primaryKey => {uuid};
}
// generated: CREATE TABLE "devices" ("uuid" TEXT NOT NULL)   -- no PK
```

---

## Root Cause

`IDartTable` (`extension/src/schema-diff/dart-schema.ts:38-54`) models `columns`, `indexes` and `uniqueKeys` but has no primary-key field, and `dart-parser.ts` never looks for a `primaryKey` getter (its only key-related regexes are `AUTO_INCREMENT_RE` and the index/uniqueKeys parsing). `dartColToDef` therefore has exactly one signal available - `autoIncrement` - and uses it as a proxy for "is the primary key". That proxy is correct only for the `integer().autoIncrement()` idiom.

The same gap makes `pk-checker.ts:21` (`hasPkInDart = dartTable.columns.some(c => c.autoIncrement)`) blind; it is currently masked there by the `hasPkInDb` clause, but it is the same missing model.

**Fix sketch**

1. Parse the override in `dart-parser.ts`: match `Set<Column>\s+get\s+primaryKey\s*=>\s*\{([^}]*)\}` inside the class body, split the captured getter names on commas, and map each Dart getter name to its `sqlName` via the already-parsed column list. Store as `primaryKey: string[]` (SQL names) on `IDartTable`.
2. In `diffToActions`, carry `primaryKey` onto the `createTable` action, and in `generateCreateTable` emit a table-level constraint when it is non-empty, dropping the per-column `PRIMARY KEY` for that case:

   ```ts
   // A composite or natural key must be a table-level constraint; the
   // per-column form is only legal (and only correct) for a single
   // INTEGER PRIMARY KEY AUTOINCREMENT rowid alias.
   if (pk.length > 0) colLines.push(`    PRIMARY KEY (${pk.map(q).join(', ')})`);
   ```

   Remember the trailing-comma handling: `generateCreateTable` currently appends `,` to all but the last column line, so adding a constraint line requires that logic to move.
3. When the parser cannot resolve a `primaryKey` getter (e.g. it references a column from a mixin), emit an explicit `// UNRESOLVED PRIMARY KEY - review` comment rather than silently producing a keyless table.
4. Fix `pk-checker.ts:21` to consult the new field in the same change, so the two consumers agree.
5. Tests: `extension/src/test/migration-codegen.test.ts` has no `primaryKey`-override fixture. Add composite and single-column natural-key cases.

---

## Impact

- Who is affected: every project using a composite or natural primary key - join tables, sync tables keyed by a server UUID, any table not using `integer().autoIncrement()`.
- What is blocked: the generated migration produces a table that is structurally wrong. Nothing warns; the file's generic "review before using!" banner is the only defence, and the omission is invisible unless the reviewer already knows the Dart definition's key.
- Data risk: **yes** - duplicate rows become insertable in a table whose Dart model assumes uniqueness, and adding the key back later requires a full table recreation with de-duplication.
- Frequency: every generated `createTable` action for such a table.
