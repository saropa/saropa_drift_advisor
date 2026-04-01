# Bug: `missing-table-in-db` false positive for class names with consecutive uppercase letters

**Created:** 2026-04-01
**Severity:** High — error-level diagnostic on correctly registered tables
**Component:** `extension/src/codelens/table-name-mapper.ts` — `dartClassToSnakeCase()`

---

## Summary

`TableNameMapper.dartClassToSnakeCase()` produces a different snake_case name than Drift's own naming algorithm when a Dart class name contains consecutive uppercase letters (e.g. acronyms like "DC", "IO", "API"). This causes the `missing-table-in-db` diagnostic to fire as a false positive — the table IS registered in `@DriftDatabase(tables: [...])` and EXISTS in the live SQLite database, but under a different name than the advisor expects.

## Root cause

The advisor's regex groups consecutive uppercase letters as a single acronym token. Drift's Dart-side algorithm treats each uppercase letter as an individual word boundary.

**Advisor (`table-name-mapper.ts:12-17`):**

```ts
static dartClassToSnakeCase(className: string): string {
  return className
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')       // lowercase|digit → uppercase
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')   // uppercase run → uppercase+lowercase
    .toLowerCase();
}
```

**Trace for `SuperheroDCCharacters`:**

| Step | Regex | Result |
|------|-------|--------|
| Input | — | `SuperheroDCCharacters` |
| 1 | `([a-z\d])([A-Z])` | `Superhero_DCCharacters` |
| 2 | `([A-Z]+)([A-Z][a-z])` | `Superhero_DC_Characters` |
| 3 | `.toLowerCase()` | `superhero_dc_characters` |

**Drift's actual output (from `drift_database.g.dart:19808`):**

```dart
static const String $name = 'superhero_d_c_characters';
```

Drift splits every uppercase letter individually: `D` and `C` become separate words → `superhero_d_c_characters`.

The advisor produces `superhero_dc_characters`. The name lookup in `schema-provider.ts` fails:

```ts
const dbTable = dbTableMap.get(dartTable.sqlTableName);
// dbTableMap has key: 'superhero_d_c_characters'
// dartTable.sqlTableName is: 'superhero_dc_characters'
// → undefined → diagnostic fires
```

## Reproduction

1. Define a Drift table class with consecutive uppercase letters in the name:

```dart
@DataClassName('SuperheroDCDriftModel')
class SuperheroDCCharacters extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get heroName => text().named('hero_name')();
}
```

2. Register it in `@DriftDatabase(tables: [SuperheroDCCharacters])`.
3. Run `build_runner` to generate the database code.
4. Run the app so the live DB contains the table.
5. Open the table file in VS Code.
6. Result:

```
[drift_advisor] Table "superhero_dc_characters" defined in Dart but missing from database
```

The actual SQLite table name is `superhero_d_c_characters`.

## Affected class names

Any Dart table class containing consecutive uppercase letters will be affected. Examples:

| Dart Class | Advisor Output | Drift Output | Match? |
|---|---|---|---|
| `SuperheroDCCharacters` | `superhero_dc_characters` | `superhero_d_c_characters` | NO |
| `HTTPClient` | `http_client` | `h_t_t_p_client` | NO |
| `IOStream` | `io_stream` | `i_o_stream` | NO |
| `ABCDef` | `abc_def` | `a_b_c_def` | NO |
| `UserProfileSettings` | `user_profile_settings` | `user_profile_settings` | YES |
| `StarWarsCharacters` | `star_wars_characters` | `star_wars_characters` | YES |

Note: the existing test cases in `table-name-mapper.test.ts` (lines 10-14) assert the *advisor's* output for `HTTPClient`, `IOStream`, and `ABCDef` — but these don't match what Drift actually generates. The tests pass because they test the wrong expected values.

## Suggested fix

Replace the regex-based conversion with Drift's actual algorithm. Drift splits on every uppercase letter boundary, treating each one as a new word:

```ts
static dartClassToSnakeCase(className: string): string {
  // Match Drift's per-character splitting: every uppercase letter starts a new word
  return className
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')   // lowercase/digit before uppercase
    .replace(/([A-Z])([A-Z])/g, '$1_$2')      // uppercase before uppercase (split each)
    .toLowerCase();
}
```

This produces `superhero_d_c_characters` — matching Drift's output.

Update the test expectations accordingly:

```ts
['HTTPClient', 'h_t_t_p_client'],
['IOStream', 'i_o_stream'],
['ABCDef', 'a_b_c_def'],
['SuperheroDCCharacters', 'superhero_d_c_characters'],
```

### Alternative: honor `@override String get tableName`

If a table class overrides `tableName`, the dart parser already uses that value (line 231-234 in `dart-parser.ts`). The fix above handles the fallback case where no override exists. Both paths should be validated.

## Affected code

- `extension/src/codelens/table-name-mapper.ts` — `dartClassToSnakeCase()` (lines 12-17)
- `extension/src/schema-diff/dart-parser.ts` — `parseDartTables()` (line 234) calls `dartClassToSnakeCase`
- `extension/src/test/table-name-mapper.test.ts` — test expectations for acronym cases (lines 10-14) are wrong
- `extension/src/diagnostics/providers/schema-provider.ts` — downstream consumer of the incorrect name

## Secondary issue: `no-foreign-keys` on static data tables

The same `SuperheroDCCharacters` table also receives a `no-foreign-keys` warning. This is not a bug per se, but static/reference data tables (character catalogs, country lists, vocabulary banks) are self-contained by design — they load from bundled assets and have no relationships to other tables. A severity-2 hint on every static data table is noise. Consider suppressing `no-foreign-keys` for tables in `static_data/` paths or providing a config option to mute it per table.
