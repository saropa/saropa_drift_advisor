# Bug: `missing-table-in-db` false positives when database is empty or unreachable

**Version:** 3.0.1  
**Diagnostic code:** `missing-table-in-db`  
**Severity:** Error (8)  
**Source file:** `extension/src/diagnostics/checkers/table-checker.ts`  
**Provider:** `extension/src/diagnostics/providers/schema-provider.ts`

---

## Summary

When the drift advisor server returns an empty schema (no tables), every Dart
table class in the workspace is flagged with `missing-table-in-db` at Error
severity. This produces a wall of false positives that obscures real issues and
erodes trust in the diagnostic system.

## Observed behavior

A project with 11 Dart table classes (`TvListings`, `EpisodeRatings`,
`Creators`, `CreatorRoles`, `ShowEpisodes`, `UserShowPrefs`, `DissentsLog`,
`WatchHistory`, `JukeboxSettings`, `TmdbImageCache`, `ActionLog`) all correctly
listed in the `@DriftDatabase(tables: [...])` annotation receives 11 separate
Error-level diagnostics:

```
[drift_advisor] Table "tv_listings" defined in Dart but missing from database
[drift_advisor] Table "episode_ratings" defined in Dart but missing from database
[drift_advisor] Table "creators" defined in Dart but missing from database
... (8 more)
```

All 11 tables are present in the `@DriftDatabase` annotation with a complete
migration strategy (`onCreate: (m) => m.createAll()` plus incremental
`onUpgrade` steps). The Dart code is correct.

## Expected behavior

When ALL Dart tables are missing from the database (i.e., `schemaMetadata()`
returns zero non-system tables), the extension should recognize this as a
special case — the database has not been created/migrated yet, or the server
is connected to an empty DB — rather than emitting N individual Error-level
diagnostics.

Possible approaches:

1. **Suppress individual diagnostics and emit a single informational message**
   like "Database appears empty — no tables found. Run the app to create the
   schema." attached to the `@DriftDatabase` annotation.
2. **Downgrade severity to Information** when all Dart tables are missing,
   since this pattern indicates a setup issue, not a schema drift bug.
3. **Gate the diagnostic on a minimum table count** in the DB — if the DB has
   zero tables (excluding `sqlite_*` system tables), skip `missing-table-in-db`
   checks entirely and show a connection/status warning instead.

## Root cause analysis

In `schema-provider.ts` lines 51–61, the provider iterates every Dart table
and calls `checkMissingTableInDb()` for each. When `dbTableMap` is empty, every
lookup returns `undefined`, so every table triggers the diagnostic:

```typescript
// schema-provider.ts:55-61
const dbTable =
  dbTableMap.get(dartTable.sqlTableName) ??
  dbNormalizedMap.get(
    TableNameMapper.normalizeForComparison(dartTable.sqlTableName),
  );

checkMissingTableInDb(issues, file, dartTable, dbTable);
```

In `table-checker.ts:20`, the check is simply:

```typescript
if (!dbTable) {
  issues.push({ code: 'missing-table-in-db', ... });
}
```

There is no awareness of whether the database is empty vs. partially populated.
The `catch` block in `schema-provider.ts:71` handles server connection failures
by returning empty issues, but an empty schema response (HTTP 200 with `[]`)
passes through normally and generates false positives.

## Reproducing

1. Open a Flutter/Drift project workspace in VS Code with the Drift Advisor
   extension active.
2. Ensure the drift advisor server is running but connected to an empty or
   freshly-created database (no tables yet — the app has not been run).
3. Observe that every `class X extends Table` in the workspace receives an
   Error-level `missing-table-in-db` diagnostic.

## Suggested fix

Add an empty-database guard in `SchemaProvider.collectDiagnostics()` before the
per-table loop:

```typescript
// After building dbTableMap, before the per-file loop:
const nonSystemTableCount = dbTableMap.size;

if (nonSystemTableCount === 0) {
  // Database is empty — don't flag every table individually.
  // Optionally emit a single informational diagnostic on the
  // @DriftDatabase annotation or the primary schema file.
  return issues;
}
```

Alternatively, the guard could live in `checkMissingTableInDb()` itself by
accepting the total DB table count as a parameter, but the provider-level guard
is simpler and avoids changing the checker API.

## Test gap

The existing test in `schema-provider.test.ts:47-59` explicitly tests the
"empty database" scenario and asserts that it SHOULD produce a
`missing-table-in-db` diagnostic. This test would need updating to reflect the
new expected behavior:

```typescript
it('should report missing-table-in-db when Dart table not in database', async () => {
  const ctx = createContext({
    dartFiles: [createDartFile('users', ['id', 'name'])],
    dbTables: [], // Empty database
  });
  const issues = await provider.collectDiagnostics(ctx);
  const issue = issues.find((i) => i.code === 'missing-table-in-db');
  assert.ok(issue, 'Should report missing-table-in-db'); // ← currently passes
});
```

New tests needed:

- **All tables missing (empty DB):** 0 diagnostics or 1 informational
  diagnostic, not N errors.
- **Some tables missing (partial migration):** Individual `missing-table-in-db`
  errors still emitted for the genuinely missing tables (existing behavior,
  unchanged).
- **Single Dart table, empty DB:** Edge case — 1 table missing out of 1 is
  technically "all missing." Decide whether this should be treated as empty-DB
  or as a real missing table.

## Affected files

| File | Role |
|------|------|
| `extension/src/diagnostics/providers/schema-provider.ts` | Where the fix should go (empty-DB guard) |
| `extension/src/diagnostics/checkers/table-checker.ts` | Current checker — no changes needed if guard is at provider level |
| `extension/src/test/schema-provider.test.ts` | Existing test to update |
| `extension/src/test/table-checker.test.ts` | May need new test cases |

## Resolution

**Status:** Fixed

**Approach:** Option 3 from the suggested approaches — gate `missing-table-in-db`
checks on a non-empty database. When `dbTableMap.size === 0`, the per-table
`checkMissingTableInDb()` calls are skipped entirely. Other per-table checks
(PK, column drift, text PK) still run since they require a matched `dbTable`
anyway and naturally produce no output when it's `undefined`.

**Files changed:**

| File | Change |
|------|--------|
| `extension/src/diagnostics/providers/schema-provider.ts` | Added `dbIsEmpty` guard before the per-table loop; `checkMissingTableInDb` only called when `!dbIsEmpty` |
| `extension/src/test/schema-provider.test.ts` | Replaced the old "empty DB produces missing-table-in-db" test with three new tests: (1) single Dart table + empty DB = 0 diagnostics, (2) multiple Dart tables + empty DB = 0 diagnostics, (3) partially populated DB still flags genuinely missing tables |

**Tests:** All 2342 tests pass.

## Environment

- **Extension version:** 3.0.1
- **Observed in project:** `saropa_bangers` (Flutter app using Drift, 11 tables)
- **Database:** SQLite via `drift_flutter` / `driftDatabase()`
- **Platform:** Windows 11 Pro, VS Code
