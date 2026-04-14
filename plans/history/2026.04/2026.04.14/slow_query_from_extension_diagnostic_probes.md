## Title
slow-query-pattern diagnostic fires on COUNT(*) queries that the extension itself executes, not the app

## Environment
- OS: Windows 11 Pro 10.0.22631 x64
- VS Code version: 1.96.2 (v22.22.1)
- Extension version: saropa_drift_advisor 3.2.0
- Dart SDK version: 3.11.4 (stable)
- Flutter SDK version: 3.41.6 (stable)
- Database type and version: SQLite (via Drift/drift_flutter)
- Connection method: Local file (drift_flutter driftDatabase helper)
- Relevant non-default settings: None
- Other potentially conflicting extensions: None relevant

## Steps to Reproduce
1. Open a Flutter project that uses Drift with multiple tables.
2. Open the database file containing Drift table class definitions.
3. Observe diagnostics on tables that have no `COUNT(*)` queries in the application code.

The `Creators` table definition:

```dart
class Creators extends Table {
  IntColumn get tvmazePersonId => integer()();
  TextColumn get name => text()();
  TextColumn get imageUrl => text().nullable()();
  DateTimeColumn get fetchedAt => dateTime()();

  @override
  Set<Column> get primaryKey => {tvmazePersonId};
}
```

The application code contains zero `COUNT(*)` queries against the `creators` table. A full-text search of the project confirms this.

## Expected Behavior
The slow-query-pattern diagnostic should only fire for queries that the application code executes. If the extension runs its own diagnostic probes (e.g., `SELECT COUNT(*) FROM "creators"` to gather table statistics), those queries should not be attributed to the user's application as performance problems.

## Actual Behavior
The extension produces this diagnostic on the `Creators` table definition (line 39):

```
[drift_advisor] Slow query (147ms, 1 rows): SELECT COUNT(*) AS c FROM "creators"
```

Severity: Warning (2).

The same pattern occurs on `ActionLog` (line 305) with multiple `SELECT COUNT(*)` and `SELECT 'action_log' AS t, COUNT(*) AS c FROM "action_log"...` queries that look like extension-internal table-size probes, not application queries. The `'action_log' AS t` alias pattern (string literal table name in select list) is a telltale sign of a diagnostic/stats-gathering query, not application logic.

Observed diagnostics on ActionLog:
- `Slow query (641559ms, 1 rows): SELECT COUNT(*) AS c FROM "action_log"` — 641 seconds is implausibly slow for a COUNT on a small table, suggesting this may have been measured during a long-running migration or while the DB was locked
- `Slow query (1073ms, 20 rows): SELECT 'action_log' AS t, COUNT(*) AS c FROM "action_log"...`
- Several more at 329ms, 244ms, 147ms, 127ms with the same pattern

## Analysis
The extension appears to run its own `SELECT COUNT(*)` queries against each table for diagnostic/statistics purposes, then reports those queries back to the user as slow-query warnings. This creates a confusing feedback loop: the extension's own overhead is presented as an application problem the developer should fix.

The 641-second query is particularly suspicious — it suggests the COUNT was running while the database was locked by a migration or another process, which is an extension-side timing issue, not an application performance problem.

## Suggested Fix
- **Exclude extension-internal queries from slow-query diagnostics.** If the extension runs its own probes, tag them internally and filter them out of user-facing diagnostics.
- **Alternatively, label them differently.** If extension probe timings are useful, report them under a separate diagnostic code (e.g., `extension-probe-slow`) so users can distinguish extension overhead from application performance issues.
- **Filter out queries measured during migration.** A 641-second COUNT on a small table is almost certainly measured while the DB was locked — not representative of runtime performance.

## What I Already Tried
- [x] Searched the entire application codebase for COUNT queries — confirmed none exist against `creators` or with the `'table_name' AS t` pattern
- [x] Added indexes on `action_log` to speed up the queries the app does run (the actual app queries use `ORDER BY performed_at DESC` with a `WHERE undone = false` filter)
- [x] The diagnostics persist after adding indexes because the flagged queries are not from the app

## Impact
- Who is affected: Any user of the extension — the probe queries run on every table
- What is blocked: Nothing blocked, but the false slow-query warnings erode trust in the diagnostic system and make it harder to identify real performance issues
- Data risk: None
- Frequency: Every time the file is opened
