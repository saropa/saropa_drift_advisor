# BUG: Generated migration adds `NOT NULL DEFAULT ''` to INTEGER/REAL/BLOB columns, corrupting existing rows

**Status: Fix Ready**

Created: 2026-09-02
Component: Extension
File: `extension/src/migration-gen/migration-codegen.ts` (line ~196)
Severity: Wrong fix

---

## Summary

`generateAddColumn` uses a single hard-coded default for every non-nullable added column: `NOT NULL DEFAULT ''`. That literal is only correct for TEXT. For an INTEGER, REAL, BOOLEAN or BLOB column SQLite stores the empty *string* in every pre-existing row (type affinity cannot convert `''` to a number), and Drift then throws a cast error the first time those rows are read.

---

## Attribution Evidence

```bash
# Positive - the generator IS here
grep -rn "NOT NULL DEFAULT" extension/src/
# extension/src/migration-gen/migration-codegen.ts:197:  const suffix = nullable ? '' : " NOT NULL DEFAULT ''";

grep -rn "generateAddColumn\|generateMigrationDart" extension/src/ | grep -v /test/
# extension/src/migration-gen/migration-codegen.ts:171:      return generateAddColumn(action);
# extension/src/migration-gen/migration-codegen.ts:195:function generateAddColumn(action: IMigrationAction): string[] {
# extension/src/migration-gen/migration-codegen.ts:134:export function generateMigrationDart(

grep -rn "NOT NULL DEFAULT" lib/src/
# Expected: 0 matches (migration generation is TypeScript-only)

# Negative - not a sibling-repo rule
grep -rn "generateAddColumn\|NOT NULL DEFAULT" ../saropa_lints/lib/src/rules/
# Expected: 0 matches   (actual: 0 matches; ../saropa_lints/lib/src/rules/ exists, 21 entries)
```

**Emit site(s) - list ALL:** `extension/src/migration-gen/migration-codegen.ts:202` (reached from `generateMigrationDart` -> `generateAction` -> `generateAddColumn`)
**Reached from:** the `Generate Migration` quick fix offered on `missing-column-in-db` and `column-type-drift` (`extension/src/diagnostics/providers/schema-provider.ts:142-155`, command `driftViewer.generateMigration`).

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

1. Existing table with rows in it:

   ```sql
   CREATE TABLE contacts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
   INSERT INTO contacts (name) VALUES ('Ada'), ('Grace');
   ```

2. Add a non-nullable integer column to the Dart definition:

   ```dart
   class Contacts extends Table {
     IntColumn get id => integer().autoIncrement()();
     TextColumn get name => text()();
     IntColumn get retryCount => integer()();   // new, not nullable
   }
   ```

3. Connect; `missing-column-in-db` fires on `retry_count`.
4. Invoke the `Generate Migration` quick fix on that diagnostic.

---

## Expected Behavior

A migration whose default is type-appropriate, e.g.:

```dart
await customStatement(
  'ALTER TABLE "contacts"'
  ' ADD COLUMN "retry_count" INTEGER NOT NULL DEFAULT 0',
);
```

so that the two existing rows get integer `0` and Drift can read them back as `int`.

---

## Actual Behavior

```dart
// Added column: contacts.retry_count
await customStatement(
  'ALTER TABLE "contacts"'
  ' ADD COLUMN "retry_count" INTEGER NOT NULL DEFAULT \'\'',
);
```

SQLite accepts this. Existing rows are backfilled with the TEXT value `''`, because INTEGER affinity leaves a string that is not a well-formed integer literal as TEXT:

```sql
SELECT id, typeof(retry_count), quote(retry_count) FROM contacts;
-- 1|text|''
-- 2|text|''
```

The first Drift read of `contacts` then fails:

```
type 'String' is not a subtype of type 'int' in type cast
```

The failure is deferred - the migration itself "succeeds", so the developer sees a green migration and a crash later, in a different place.

---

## Minimal Reproducible Example

Pure-function reproduction, no VS Code required:

```ts
generateAddColumn({
  type: 'addColumn',
  table: 'contacts',
  column: 'retry_count',
  newType: 'INTEGER',
  nullable: false,
});
```

returns

```
[ '// Added column: contacts.retry_count',
  'await customStatement(',
  '  \'ALTER TABLE "contacts"\'',
  '  \' ADD COLUMN "retry_count" INTEGER NOT NULL DEFAULT \'\'\',',
  ');' ]
```

The same wrong default is produced for `REAL`, `BLOB` and `BOOLEAN` (`DART_TO_SQL_TYPE` maps `BoolColumn` and `DateTimeColumn` to `INTEGER`, so a new non-nullable `DateTimeColumn` is backfilled with `''` and then read as a timestamp).

Note the emitted Dart is also questionable at the source level: the generated line contains a bare `''` inside a single-quoted Dart string. Whether it compiles depends on how the caller writes the string out; the SQL-level defect above is independent of that.

### The existing test covers only the one type where the default is correct

`extension/src/test/migration-codegen.test.ts:271-289` (`should add NOT NULL default for
non-nullable add column`) builds its fixture with `sqlType: 'TEXT'` and asserts:

```ts
assert.ok(code.includes("NOT NULL DEFAULT ''"));
```

`''` is the right default for TEXT, so the test passes and gives the impression the behaviour is
covered. There is no INTEGER, REAL, BLOB or BOOLEAN fixture anywhere in the file, which is why the
defect has never surfaced in CI.


---

## Root Cause

`migration-codegen.ts:196-197` (pre-fix):

```ts
const nullable = action.nullable ?? true;
const suffix = nullable ? '' : " NOT NULL DEFAULT ''";
```

`action.newType` is available on the same object (it is interpolated two lines below) but was not consulted when choosing the default. The empty string was presumably chosen as "a value that satisfies NOT NULL" without accounting for SQLite type affinity, which does not coerce `''` to `0` / `0.0` / `x''`.

---

## Changes Made

- `extension/src/migration-gen/migration-codegen.ts`: added `defaultLiteralForSqlType(sqlType)`, mapping `TEXT` -> `''`, `INTEGER`/`BOOLEAN` -> `0`, `REAL` -> `0.0`, `BLOB` -> `x''`, and any other/unrecognized type -> `null`. `generateAddColumn` now:
  - Emits no `DEFAULT` clause at all for nullable columns (previously emitted `${action.newType}` with an empty suffix — no behavior change there, just now an explicit early return rather than string-concatenating an empty suffix).
  - For non-nullable columns with a recognized type, emits `NOT NULL DEFAULT <type-appropriate literal>` plus a `// TODO` comment noting the value is a sentinel, not a real value, and should be reviewed.
  - For non-nullable columns with an unrecognized/ambiguous type, emits `NOT NULL` with **no** default and a `// TODO` comment telling the reviewer to add `DEFAULT <value>` manually — avoids guessing wrong the same way the original bug did.
- `extension/src/test/migration-codegen.test.ts`: added regression cases for INTEGER, BOOLEAN, REAL, BLOB defaults, the unrecognized-type TODO fallback, and confirmed nullable columns still get no `NOT NULL`/`DEFAULT` clause.
- `CHANGELOG.md`: added a `[Unreleased]` **Fixed** entry describing the corruption and the fix.
- Not implemented (deferred, out of scope for this fix): the bug report's suggestion to special-case `DateTimeColumn` with `strftime('%s','now')`. `DateTimeColumn` compiles to SQL type `INTEGER` in this codebase's schema-diff layer, so it currently gets the generic INTEGER default (`0`, i.e. epoch) plus the generic sentinel TODO comment — which is a safe, non-corrupting value, just not a "real" timestamp. A dedicated DateTime-aware default would need to distinguish `DateTimeColumn` from plain `IntColumn` earlier in the pipeline (schema-diff/dart-schema), which is a bigger change than this bug's scope.

## Verification

- `npx tsc --noEmit -p extension/tsconfig.json` — no errors in `migration-codegen.ts` or its test file (one pre-existing unrelated error surfaced in `editing-bridge.ts` from concurrent work on a different bug; not touched here).
- `cd extension && npx tsc -p ./ && node --max-old-space-size=4096 node_modules/mocha/bin/mocha.js --require test/register-mock.js --reporter min out/test/migration-codegen.test.js` — all tests passing, including the 6 new cases added for this fix.

---

## Impact

- Who is affected: anyone who uses the `Generate Migration` quick fix to add a non-nullable non-TEXT column to a table that already has rows - the ordinary case for a shipped app.
- What is blocked: the generated migration is silently destructive. It runs cleanly and leaves the database in a state Drift cannot read, with the crash surfacing later at an unrelated call site.
- Data risk: **yes** - every pre-existing row of the table gets a wrongly-typed value in the new column, and the migration is not reversible once shipped to users' devices.
- Frequency: every generated `addColumn` action for a non-nullable non-TEXT column.
