# Bug: UUID Column Name Mismatch — Dart vs Database

**Created**: 2026-04-05
**Severity**: Error (schema mismatch — queries may fail)
**Diagnostic codes**: `missing-column-in-db`, `extra-column-in-db`

## Summary

Two tables define a Dart getter named `contactSaropaUUID` (uppercase `UUID`). Drift's camelCase-to-snake_case converter treats each uppercase letter as a word boundary, producing the column name `contact_saropa_u_u_i_d`. However, the actual database column is `contact_saropa_uuid`. This creates a mismatch: Drift generates SQL referencing a column that doesn't exist.

## Affected Tables

### 1. `contact_reaction_record_table.dart`

- **Dart getter**: `TextColumn get contactSaropaUUID => text()();` (line 23)
- **Drift-generated column name**: `contact_saropa_u_u_i_d`
- **Actual DB column name**: `contact_saropa_uuid`
- **Index also affected**: `idx_contact_reaction_record_contact_uuid` references `#contactSaropaUUID`

### 2. `native_contact_rollback_table.dart`

- **Dart getter**: `TextColumn get contactSaropaUUID => text()();` (line 22)
- **Drift-generated column name**: `contact_saropa_u_u_i_d`
- **Actual DB column name**: `contact_saropa_uuid`
- **Index also affected**: `idx_native_rollback_contact_uuid` references `#contactSaropaUUID`

## Root Cause

Drift's `ReCase` (snake_case converter) splits on every uppercase letter boundary. The acronym `UUID` becomes `u_u_i_d` because each letter (U, U, I, D) is treated as a separate word:

```
contactSaropaUUID
       ^    ^^^^
       |    U_U_I_D  ← each capital = new word
       Saropa
```

The database was likely created with a hand-written migration or an earlier schema that used the conventional `uuid` spelling, producing `contact_saropa_uuid`.

## Fix Options

### Option A: Rename the Dart getter (recommended)

Change `contactSaropaUUID` → `contactSaropaUuid` (title-case `Uuid`). Drift will then generate `contact_saropa_uuid`, matching the database.

```dart
// Before
TextColumn get contactSaropaUUID => text()();

// After — Drift generates "contact_saropa_uuid"
TextColumn get contactSaropaUuid => text()();
```

This also requires updating `@TableIndex` symbol references from `#contactSaropaUUID` to `#contactSaropaUuid`.

**Pros**: Clean, idiomatic Dart (acronyms in camelCase use only initial cap per Effective Dart).
**Cons**: Requires updating all Dart references to the generated field name.

### Option B: Add explicit `.named()` column override

```dart
TextColumn get contactSaropaUUID => text().named('contact_saropa_uuid')();
```

**Pros**: No rename needed, existing Dart code unchanged.
**Cons**: Hides the mismatch behind a manual override; other `UUID` getters may have the same problem.

## Drift Advisor Diagnostic Accuracy

Previously the advisor reported this as two separate diagnostics:
- `missing-column-in-db`: the Drift-generated name doesn't exist in the DB
- `extra-column-in-db`: the DB has a column Drift doesn't know about

This pairing required the user to correlate them manually.

### Fix Applied

The column checker now uses normalized comparison (strip underscores,
lowercase) — the same approach already used for table-level matching.
When a Dart column name differs from a DB column only by acronym
underscore splitting, a single `column-name-acronym-mismatch`
diagnostic is emitted instead of the split pair. The message explains
the root cause and suggests both fix options (rename getter or add
`.named()` override).

**Files changed:**
- `extension/src/diagnostics/codes/schema-codes.ts` — new `column-name-acronym-mismatch` code
- `extension/src/diagnostics/checkers/column-checker.ts` — normalized fallback matching
- `extension/src/diagnostics/providers/schema-provider.ts` — code action for new diagnostic
- `extension/src/test/schema-provider.test.ts` — three new tests

## Recommendation

Use Option A. It fixes the root cause, follows Dart naming conventions, and prevents the same issue in future `Uuid`-containing columns. Run `build_runner` after the rename to regenerate Drift code.
