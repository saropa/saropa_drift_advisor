# BUG: `/api/analytics/anomalies` runs 3-5 serial full-table scans per column with no row guard and no timeout

**Status: Fixed**

Created: 2026-09-02
Component: Server
File: `lib/src/server/anomaly_detector.dart` (lines ~59-165, 277, 313, 549, 607, 710, 827, 863)
Severity: Performance

---

## Summary

`AnomalyDetector.getAnomaliesResult` walks every table and, for every column, issues separate
aggregate queries - each a full scan - sequentially with `await` inside nested loops. Per table it
also runs `SELECT COUNT(*) FROM (SELECT DISTINCT * FROM t)`, which forces SQLite to build a temporary
B-tree over **every column of every row, BLOBs included**. There is no row-count guard, no per-query
timeout, no overall budget, and no concurrency limit on the endpoint. On a mid-size schema this is
thousands of serial full scans on the connected app's single SQLite connection, during which every
other endpoint queues behind it.

---

## Attribution Evidence

```bash
# Positive - the nested per-table / per-column scan loops and their queries
grep -n "for (final\|await query(" lib/src/server/anomaly_detector.dart
# 59:    for (final tableName in tableNames) {
# 63:        await query('PRAGMA table_info(...)'),
# 67:          await query(                         <- SELECT COUNT(*) per table
# 75:      for (final col in colInfoRows) {
# 277:        await query(                          <- NULL scan, per NOT NULL column
# 313:        await query(                          <- empty-string scan, per NOT NULL text column
# 549:      await query(                            <- outlier pass 1 (AVG/MIN/MAX/COUNT), per numeric column
# 607:      await query(                            <- outlier pass 2 (variance), per numeric column
# 710:        await query(                          <- log-scale pass 3, per flagged column
# 770:      await query(                            <- PRAGMA foreign_key_list, per table
# 816:    for (final edge in edges) {
# 827:          await query(                        <- LEFT JOIN orphan count, per FK edge
# 863:        await query(                          <- SELECT DISTINCT *, per table

# No timeout is applied anywhere in the detector, unlike the SQL handler
grep -n "timeout" lib/src/server/anomaly_detector.dart
# (0 matches)
grep -n "sqlStatementTimeout" lib/src/server/sql_handler.dart | head -2
# 74:          ? await _ctx.internalQuery(sql).timeout(_ctx.sqlStatementTimeout)
# 80:            ).timeout(_ctx.sqlStatementTimeout);

# No row-count guard: tableRowCount is fetched but only used for a percentage and a comparison
grep -n "tableRowCount" lib/src/server/anomaly_detector.dart
# 64:      final tableRowCount = ServerUtils.extractCountFromRows(
# 92:              tableRowCount: tableRowCount,
# 162:        tableRowCount: tableRowCount,
# 286:    final pct = tableRowCount > 0 ? (nullCount / tableRowCount * 100) : 0;
# 870:    if (tableRowCount > distinctCount) {
```

**Emit site(s) - list ALL:** the `await query(` lines above, all inside
`AnomalyDetector.getAnomaliesResult` and its private detectors. Reached from
`GET /api/analytics/anomalies` (`lib/src/server/router.dart:963`), `GET /api/issues`
(`lib/src/server/router.dart:952`), `GET /api/report` (`lib/src/server/report_handler.dart`, via
`_collectAnomalies`), and the VM-service RPC `Router.getAnomaliesResult`
(`lib/src/server/router.dart:1178`).
**Diagnostic `source` / `owner` as seen in Problems panel:** n/a (runtime server behavior).

---

## Environment

- OS:
- VS Code version:
- Extension version:
- Dart SDK version:
- Flutter SDK version (if applicable):
- Database type and version: SQLite (any)
- Connection method: HTTP loopback
- Relevant non-default settings: none
- Other potentially conflicting extensions:

---

## Steps to Reproduce

1. Point the server at a schema with 40 tables averaging 15 columns, several tables over 100 000
   rows, and at least one BLOB column.
2. `curl -s http://127.0.0.1:8642/api/analytics/anomalies`
3. While it runs, `curl -s http://127.0.0.1:8642/api/health` and
   `curl -s http://127.0.0.1:8642/api/tables` from a second terminal.

---

## Expected Behavior

The scan completes in bounded time on a large schema, degrades gracefully (skips or samples oversized
tables and says so in the response envelope), and never starves other endpoints.

---

## Actual Behavior

Query volume for that schema, counting only what the code guarantees:

| source | count |
|---|---|
| `PRAGMA table_info` + `COUNT(*)` per table | 80 |
| NULL scan per NOT NULL column | up to 600 |
| empty-string scan per NOT NULL text column | up to 600 |
| outlier passes 1-3 per numeric column | up to 3 x 200 = 600 |
| `PRAGMA foreign_key_list` + one LEFT JOIN per FK edge | 40 + edges |
| `SELECT DISTINCT *` per table | 40 |

Roughly **2000 serial full scans**, each an await round-trip through the host's Drift executor.

The `SELECT DISTINCT *` scans are the worst individually: SQLite sorts every column of every row, so
a table with a 1 MB BLOB column and 10 000 rows pushes ~10 GB through the temp store. The result is
also structurally useless on any table with an `INTEGER PRIMARY KEY` - every row is distinct by
construction, so `tableRowCount > distinctCount` can never be true and the scan can never produce a
finding.

Because SQLite serializes on the connection, `/api/health`, `/api/tables` and the `/api/generation`
long-poll all block behind the scan for its full duration. With no timeout anywhere in the detector,
one pathological scan reproduces the all-endpoints wedge signature recorded in
`plans/history/2026.06/2026.06.24/BUG_loopback_server_wedges_and_hard_to_discover_for_agents.md` -
the failure `SqlHandler` added `.timeout(_ctx.sqlStatementTimeout)` to prevent, a guard the detector
never received.

---

## Error Output

No error is produced. The symptom is a multi-minute hang and an apparently dead server; external
tooling that probes `/api/health` times out and reports the server absent.

---

## Duplicate-Emission Check

Dart-only. The extension consumes `/api/issues` but does not re-implement the scan, so there is no
second emit path to fix.

---

## What I Already Tried

- [x] Enumerated every query the detector can emit and confirmed each is a separate awaited call
- [x] Confirmed `tableRowCount` is read but never used to skip or sample an oversized table
- [x] Confirmed zero `timeout` usage in the file, against `SqlHandler`'s two
- [x] Confirmed `_detectDuplicateRows` is unconditional - no rowid-alias / unique-column short-circuit

---

## Regression Info

- Last working version: n/a - the scan has never been bounded
- First broken version:
- What changed: detectors were added incrementally; each is cheap in isolation, and the product was
  never measured

---

## Root Cause

Each detector was written as an independent per-column probe with no shared budget. The real cost is
`tables x columns x detectors`, and nothing in the code observes that product.

**Proposed fix sketch:**

1. **Collapse the per-column probes into one query per table.** The NULL and empty-string counts are
   expressible as a single scan - `SELECT SUM(a IS NULL) AS n_a, SUM(a = '') AS e_a, SUM(b IS NULL)
   AS n_b, ... FROM t` - and the outlier pass-1 aggregates (`AVG`, `MIN`, `MAX`, `COUNT` per numeric
   column) fold into that same SELECT. This alone removes roughly 1800 of the ~2000 scans.
2. **Guard `_detectDuplicateRows`.** Skip it entirely when the table has an `INTEGER PRIMARY KEY` or
   any `UNIQUE` index over a NOT NULL column - both are readable from the `PRAGMA table_info` /
   `PRAGMA index_list` output the scan already fetches, and the answer is provably zero. Otherwise
   run `DISTINCT` over the non-BLOB columns only, and skip when `tableRowCount` exceeds a threshold,
   reporting `skipped: too_large` so the omission is visible rather than silent.
3. **Add a row-count guard and an overall wall-clock budget.** Skip or sample tables over N rows;
   stop the whole scan at the budget and return partial results with `truncated: true` instead of
   running unbounded.
4. **Apply `.timeout(_ctx.sqlStatementTimeout)`** to every detector query so a single slow scan
   cannot wedge the connection for every other endpoint.
5. Extend `test/stress_performance_test.dart` with a wide-schema fixture asserting the total emitted
   query count stays under a bound. The invariant that needs mechanical protection is the query
   *count*, not the shape of any individual query.

---

## Changes Made

1. **Collapsed per-column probes into combined queries** (`anomaly_detector.dart`): NULL counts, empty-string counts, and outlier pass-1 aggregates (AVG/MIN/MAX/COUNT) are folded into a single `SELECT ... FROM table` per table. Variance queries are similarly combined. This eliminates ~1800 of the ~2000 serial scans for the reference 40-table schema.

2. **Guarded `_detectDuplicateRows`**: skips tables with any primary key (every row is unique by construction); excludes BLOB columns from the DISTINCT projection; skips tables exceeding 100K rows (`_maxRowsForDuplicateCheck`).

3. **Added row-count guard**: tables exceeding 1M rows (`_maxRowsForFullScan`) skip per-column anomaly processing. The combined scan still runs (it's one pass) but results are not acted on.

4. **Applied `.timeout(statementTimeout)`**: every detector query is now wrapped with the caller's statement timeout. `getAnomaliesResult` accepts a new optional `statementTimeout` parameter; both call sites in `AnalyticsHandler` pass `_ctx.sqlStatementTimeout`.

5. **Added wall-clock budget**: the entire scan respects a 60-second budget (`_scanBudget`). Partial results are returned with `truncated: true`.

6. **Added query-count regression test** (`stress_performance_test.dart`): a 40-table × 15-column schema asserts total query count stays under 10×tableCount, preventing regression to O(tables × columns).

7. **Extracted per-table scan into `_scanTable`, caught per-table timeouts**: a timeout on one table's combined scan (e.g. a slow table under connection contention) is caught with `on TimeoutException` inside the per-table loop and appends a `scan_skipped` info anomaly for that table only. Without this the timeout propagated to the caller's generic error handler and discarded every anomaly already found on prior tables, turning the per-statement timeout into a scan-wide failure — the opposite of the `truncated: true` partial-results behavior. Regression test added: `per-table timeout isolation`.

8. **Positional (index-based) SQL aliases**: the combined scan and variance queries alias columns as `null_0`, `avg_2`, `var_1`, etc. (index into the classified-column list) instead of a sanitized column name. A prior name-based scheme could collide — two distinct column names that sanitize to the same alias (e.g. `foo-bar` and `foo_bar`) would silently overwrite each other's stats in the result row map. Positional aliases make collision impossible regardless of naming.

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- Who is affected: any host with a non-trivial schema. The scan is also reached indirectly via
  `/api/issues` (consumed by Saropa Lints) and `/api/report`, so users trigger it without asking for
  an anomaly scan.
- What is blocked: the whole server for the duration of the scan - health probes included, so
  external tooling concludes the server is dead.
- Data risk: none.
- Frequency: every invocation; severity scales with schema width and table size.

---

## Finish Report (2026-09-07)

`AnomalyDetector.getAnomaliesResult` issued thousands of serial per-column full-table scans (up to ~2000 on a 40-table/15-column schema) with no timeout, no row-count guard, and no wall-clock budget, wedging the host's single SQLite connection and starving every other endpoint including health probes.

The fix collapses NULL/empty-string/outlier-pass-1 probes into one combined `SELECT` per table and variance checks into a second, replacing ~1800 of ~2000 scans. `_detectDuplicateRows` now skips tables with a primary key (uniqueness is guaranteed by construction), excludes BLOB columns from its DISTINCT projection, and skips tables over 100K rows. A row-count guard (1M rows) skips per-column processing on oversized tables, and a 60-second wall-clock budget returns partial results (`truncated: true`) instead of running unbounded. Every query is wrapped in the caller's `sqlStatementTimeout`.

A follow-on code review caught two defects introduced by the refactor before they shipped: (1) a timeout on one table's scan was not isolated — it propagated past the table loop to the caller's generic error handler and discarded every anomaly already collected for prior tables, defeating the purpose of both the per-statement timeout and the wall-clock budget. Fixed by extracting `_scanTable` and catching `TimeoutException` per table, appending a `scan_skipped` note for the failed table while preserving all other results. (2) The combined-query column aliases were derived from sanitized column names (non-alphanumeric characters replaced with `_`), so two distinct column names that sanitize identically (e.g. `foo-bar` and `foo_bar`) would collide on the same alias and silently overwrite one column's stats with another's. Fixed by switching to positional (list-index) aliases, which cannot collide regardless of naming.

Query count on the reference 40-table/15-column stress fixture is now asserted to stay under 10×tableCount (`test/stress_performance_test.dart`), and a new `per-table timeout isolation` test confirms a timed-out table does not discard other tables' findings.
