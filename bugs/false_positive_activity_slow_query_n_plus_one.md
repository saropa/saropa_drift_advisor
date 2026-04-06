# False Positive: Slow Query and N+1 Warnings on Table Definition

**Created**: 2026-04-05
**Severity**: Low (misattributed diagnostic)
**Diagnostic codes**: `slow-query-pattern`, `n-plus-one`

## Summary

Two runtime performance diagnostics are reported against the `activity_table.dart` table definition file, but they describe runtime query behavior, not a schema problem. The warnings are pinned to line 21 of the table class, which is just a column definition — not the code issuing the queries.

## Diagnostics

### 1. `slow-query-pattern` — "Slow query (3606ms): SELECT 'activities' AS t, COUNT(*) AS c FROM \"activities\"..."

This is a `COUNT(*)` full-table scan. The slowness is a function of:
- Table row count (data volume)
- Lack of a covering index (if the count is filtered)
- Device I/O speed

The table definition file cannot fix this. The fix, if needed, would be in the calling code — either caching the count, using an approximate count, or adding an index for filtered counts.

### 2. `n-plus-one` — "Potential N+1 query pattern: \"activities\" queried 20 times in recent window"

This is a runtime access pattern observation. The table definition has no control over how many times application code queries it. The fix would be in the calling code — batching queries or using joins.

## Root Cause

The advisor maps runtime query telemetry back to the table definition file as the diagnostic location. This is misleading because:
- The developer reading the table file has no context about which call sites issued the queries
- The table definition cannot be changed to fix a runtime access pattern
- The diagnostic should be reported against the Dart call site that executes the query, or in a separate runtime report

## Suggested Improvements

1. **Report runtime diagnostics against call sites, not table definitions.** If the advisor has query traces, it should resolve the originating Dart code (e.g., `activity_io.dart:42`) and report there.
   - **STATUS: PARTIALLY IMPLEMENTED.** Infrastructure added (`callerFile`/`callerLine` in `QueryTiming`, `resolveCallerLocation()` in extension). Currently resolves to null for server-issued queries because all tracked queries originate from the server's internal handlers, not user application code. The call-site pinning will activate when user-code query tracking is added (e.g., via a Drift executor wrapper that calls `recordTiming()`).

2. **If call-site resolution is not possible, use a separate report category** (e.g., "Runtime Performance") rather than attaching to the table file. Developers scanning table definitions for schema issues should not see runtime noise.
   - **STATUS: NOT YET IMPLEMENTED.** Requires changing the diagnostic category from `performance` to `runtime`, which could break existing user configurations.

3. **For N+1 detection, include the call stack or query pattern** — "queried 20 times" is not actionable without knowing whether the 20 calls are from a loop (fixable) or 20 independent features (expected).
   - **STATUS: IMPLEMENTED.** N+1 messages for counts >= 20 now include a batching hint ("likely a loop; consider batching with JOIN or IN clause").

4. **For slow-query, include the row count and whether an index could help** — a 3.6s `COUNT(*)` on 500K rows is expected; on 500 rows it's a real problem. The diagnostic doesn't distinguish.
   - **STATUS: PARTIALLY IMPLEMENTED.** Row count is now included in the message (e.g., "Slow query (3606ms, 500000 rows)"). Index suggestion is handled by the separate `unindexed-where-clause` diagnostic.
