# BUG: Every `DateTimeColumn` is flagged as type drift when `store_date_time_values_as_text` is enabled

**Status: Open**

Created: 2026-09-02
Component: Extension
File: `extension/src/schema-diff/dart-schema.ts` (line ~61), `extension/src/diagnostics/checkers/column-checker.ts` (line ~81)
Severity: False positive

---

## Summary

`DART_TO_SQL_TYPE` hard-codes `DateTimeColumn: 'INTEGER'`. Drift's `store_date_time_values_as_text: true` build option makes the generated schema store datetimes as `TEXT` (ISO-8601), and Drift's own docs recommend it for new projects. Nothing in the extension reads `build.yaml`, so in such a project **every** datetime column in **every** table emits `column-type-drift` at Warning, forever.

---

## Attribution Evidence

```bash
# Positive — diagnostic IS defined here
grep -rn "'column-type-drift'" extension/src/
# extension/src/diagnostics/checkers/column-checker.ts:94:        code: 'column-type-drift',
# extension/src/diagnostics/codes/schema-codes.ts:46:  'column-type-drift': {
# extension/src/diagnostics/codes/schema-codes.ts:47:    code: 'column-type-drift',
# extension/src/diagnostics/providers/schema-provider.ts:145:      code === 'column-type-drift'

grep -rn "'column-type-drift'" lib/src/
# Expected: 0 matches (TypeScript-only diagnostic)

# The build option is only ever mentioned in a message string — never read
grep -rn "store_date_time_values_as_text" --include=*.ts --include=*.dart .
# ./extension/src/diagnostics/checkers/column-checker.ts:84:      // common cause is the build.yaml `store_date_time_values_as_text`
# ./extension/src/diagnostics/checkers/column-checker.ts:90:          ? '. Check store_date_time_values_as_text in build.yaml'
# ./extension/src/test/schema-provider.test.ts:171,172,197,198
# (no parser, no reader, no config key)

# Negative — not a sibling-repo rule
grep -rn "'column-type-drift'" ../saropa_lints/lib/src/rules/
# Expected: 0 matches   (actual: 0 matches; ../saropa_lints/lib/src/rules/ exists, 21 entries)
```

**Emit site(s) — list ALL:** `extension/src/diagnostics/checkers/column-checker.ts:93`
**Diagnostic `source` / `owner` as seen in Problems panel:** `drift-advisor`

---

## Environment

- OS: Windows 11 Pro 10.0.22631
- Extension version: 4.2.5
- Database type and version: SQLite (Drift 2.x)
- Connection method: local debug server
- Relevant non-default settings: `build.yaml` with `store_date_time_values_as_text: true`

---

## Steps to Reproduce

1. `build.yaml` at the project root:
   ```yaml
   targets:
     $default:
       builders:
         drift_dev:
           options:
             store_date_time_values_as_text: true
   ```
2. Table:
   ```dart
   class Contacts extends Table {
     IntColumn get id => integer().autoIncrement()();
     DateTimeColumn get createdAt => dateTime()();
     DateTimeColumn get updatedAt => dateTime()();
   }
   ```
3. `dart run build_runner build`, run the app so the schema is created, then connect the extension.

---

## Expected Behavior

No diagnostics. The Dart definition and the database agree — `TEXT` is the correct storage for a `DateTimeColumn` under this build option, and Drift's generated code round-trips it correctly.

---

## Actual Behavior

Two Warnings (one per datetime column, scaling to one per datetime column in the whole schema):

> drift-advisor Column "contacts.created_at" type mismatch: Dart schema expects INTEGER but database has TEXT. Either update the database column or change the Dart definition. Check store_date_time_values_as_text in build.yaml

The advice is self-defeating: "update the database column or change the Dart definition" are both wrong actions — the schema is already correct. The trailing hint identifies the cause but the diagnostic still fires at Warning and cannot be resolved without disabling the rule outright.

---

## Minimal Reproducible Example

`PRAGMA table_info(contacts)` in the reproduced project:

```
cid  name        type     notnull  dflt_value  pk
0    id          INTEGER  1        NULL        1
1    created_at  TEXT     1        NULL        0
2    updated_at  TEXT     1        NULL        0
```

Checker arithmetic (`column-checker.ts:81-104`):

```ts
const expectedType = DART_TO_SQL_TYPE['DateTimeColumn'];  // 'INTEGER'  (dart-schema.ts:61)
dbCol.type // 'TEXT'
expectedType && dbCol.type !== expectedType               // true -> emit
```

---

## Root Cause

`DART_TO_SQL_TYPE` is a static map, but the Dart→SQL mapping for `DateTimeColumn` is *configuration-dependent*. The build option that decides it lives in `build.yaml`, which the extension never reads — `dart-file-parser.ts` reads only `pubspec.yaml`, and only to test `isDriftProject`.

The `dateTimeHint` at `column-checker.ts:86-91` is an acknowledgement of the problem that does not fix it: it converts an unfixable Warning into an unfixable Warning with an explanation.

**Fix sketch**

1. Read `build.yaml` once per refresh alongside the existing `pubspec.yaml` read in `dart-file-parser.ts`, and extract `store_date_time_values_as_text` (checking `targets.$default.builders.drift_dev.options` and the `drift_dev|...` variants). Cache it on `IDiagnosticContext` next to `dartFiles`.
2. Make the mapping a function rather than a constant:
   ```ts
   export function dartToSqlType(dartType: string, dateTimeAsText: boolean): string | undefined {
     if (dartType === 'DateTimeColumn') return dateTimeAsText ? 'TEXT' : 'INTEGER';
     return DART_TO_SQL_TYPE[dartType];
   }
   ```
   `DART_TO_SQL_TYPE` also feeds `schema-diff` and `migration-gen`, so route those through the same function or the generated migrations will disagree with the live schema for the same reason.
3. When `build.yaml` is absent or unparseable, accept **either** INTEGER or TEXT for `DateTimeColumn` rather than asserting INTEGER — a suppressed true positive is cheaper than one Warning per datetime column.
4. Test: a fixture with `dateTimeAsText: true` and a `TEXT` `created_at` asserting zero issues, plus the existing INTEGER case asserting it still fires when the option is off.

---

## Impact

- Who is affected: every project using `store_date_time_values_as_text: true`, which Drift's documentation recommends for new projects.
- What is blocked: the `column-type-drift` rule as a whole. A schema with 30 datetime columns produces 30 permanent Warnings, which buries genuine type drift and pushes users to disable the rule.
- Data risk: none directly, but the same static map drives `migration-gen`, so a generated migration for such a project would emit `ALTER TABLE ... ADD COLUMN "x" INTEGER` for a datetime column that Drift will write ISO strings into.
- Frequency: every refresh, once per datetime column.
