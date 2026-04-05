# BUG: extra-table-in-db fires for a table that IS declared in Dart

**Date:** 2026-04-05
**Severity:** High
**Component:** Diagnostics / Schema diff / Table matching
**Code:** `extra-table-in-db`
**Affects:** Tables whose Drift-generated SQL name doesn't match what the checker expects

---

## Summary

The diagnostic reports:

```
[drift_advisor] Table "superhero_dc_characters" exists in database but not in Dart
```

This is wrong. The table **is** declared in Dart:

- **File:** `lib/database/drift/tables/static_data/contact/superhero_dc_table.dart`
- **Class:** `SuperheroDCCharacters extends Table` (line 13)
- **Data class:** `@DataClassName('SuperheroDCDriftModel')` (line 6)
- **Included in DB:** `drift_database.dart` line 93 in the `@DriftDatabase(tables: [...])` list
- **Imported:** `drift_database.dart` line 20

The table exists in both Dart and the database. The diagnostic is a false positive.

## Root cause (likely)

The Dart class name is `SuperheroDCCharacters`. Drift converts this to a SQL table name using its standard camelCase-to-snake_case algorithm. For consecutive uppercase letters like "DC", Drift produces `superhero_d_c_characters` (inserting underscores between each uppercase letter).

However, the pre-built SQLite database has the table named `superhero_dc_characters` (no underscore between D and C), likely because the table was created manually or by a different code generation step.

The schema diff compares:
- **Dart-derived name:** `superhero_d_c_characters`
- **DB actual name:** `superhero_dc_characters`

These don't match, so the checker concludes the DB table has no Dart counterpart.

**Evidence supporting this theory:** The diagnostic does NOT also report a `missing-table-in-db` for `superhero_d_c_characters`, which it would if the Dart parser were working correctly but the table were genuinely missing. This asymmetry suggests the Dart parser either didn't detect the class or the name normalization is inconsistent.

## Additional evidence

The `missing-id-index` diagnostic on the same file reports the column as `superhero_d_c_characters.wikidata_id` — confirming that the Dart parser sees the table name as `superhero_d_c_characters`. But the `extra-table-in-db` diagnostic references `superhero_dc_characters` from the database. The two names are not being matched.

## Expected behavior

The table name comparison should handle Drift's camelCase-to-snake_case conversion consistently, including edge cases with consecutive uppercase letters. Either:

1. Both sides should use the same normalization algorithm
2. Or the checker should use Drift's own `TableInfo.actualTableName` to get the canonical SQL name

## Reproduction steps

1. Create a Drift table class with consecutive uppercase letters in the name (e.g., `SuperheroDCCharacters`, `MyAPITable`, `HTMLParser`)
2. Pre-build a SQLite database where the table is named with natural casing (e.g., `superhero_dc_characters` instead of `superhero_d_c_characters`)
3. Open the project in VS Code with Drift Advisor enabled
4. Observe `extra-table-in-db` on the DB table and potentially `missing-table-in-db` on the Dart class

## Impact

- **Error-level false positive** (severity 2 = Information in this case, but in other configurations it could be Error)
- Misleading: suggests an orphaned table when the table is properly wired up
- Could cause a developer to waste time investigating or to create a duplicate table definition

## Suggested fix

Use Drift's own table name resolution rather than a separate camelCase-to-snake_case implementation. The generated `.g.dart` file contains the actual table name in the `$TableName` class. Alternatively, normalize both the Dart-derived name and the DB name to the same format before comparison:

```typescript
// Normalize both names for comparison
function normalizeTableName(name: string): string {
  return name.toLowerCase().replace(/_/g, '');
}

// "superhero_d_c_characters" → "superherodccharacters"
// "superhero_dc_characters"  → "superherodccharacters"
// These now match
```

## Files likely involved

| File | Role |
|------|------|
| `extension/src/schema-diff/dart-parser.ts` | Converts Dart class name to expected SQL table name |
| `extension/src/schema-diff/db-schema-reader.ts` | Reads actual table names from SQLite |
| `extension/src/diagnostics/checkers/table-checker.ts` | Compares Dart-derived names with DB names |
