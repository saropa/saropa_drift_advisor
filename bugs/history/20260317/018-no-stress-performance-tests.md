# BUG-018: No stress or performance tests for large databases

## Status: Resolved

## Severity: Significant

## Component: Dart Tests

## Files

- `lib/src/server/server_context.dart` (UNION ALL change detection)
- `lib/src/server/table_handler.dart` (pagination)
- `lib/src/server/analytics_handler.dart` (anomaly detection)
- `lib/src/server/snapshot_handler.dart` (full DB snapshot)

## Description

There are no tests verifying behavior with large databases. Several features
have potential scaling issues:

1. **Change detection UNION ALL query**: Builds a single query joining all tables
   (`SELECT 'table1' AS t, COUNT(*) AS c FROM "table1" UNION ALL ...`). With
   100+ tables, this query could be very large and slow.
2. **Query timing ring buffer**: Fixed at 500 entries but never tested under
   pressure or concurrent writes.
3. **Full DB snapshots**: Captures `SELECT *` from every table into memory. Large
   databases could cause OOM.
4. **Anomaly detection**: Scans every column of every table — O(tables * columns)
   queries.
5. **Schema diagram SVG**: Layout algorithm assumes grid with 4 columns — may
   produce unwieldy SVGs with many tables.

## Resolution summary

- **test/stress_performance_test.dart** added with 7 tests:
  - Change detection: 120-table and 150-table UNION ALL query building and deterministic signature.
  - Ring buffer: 800 concurrent insertions (buffer stays at 500); sequential fill then 100 more (eviction of oldest).
  - Snapshot: POST /api/snapshot with 30×200 and 50×100 tables/rows via real server.
  - Anomaly: 25 tables × 20 columns scan completes within 15s timeout.
- Configurable limits (max tables for snapshot, max columns for anomaly) left as future work.
