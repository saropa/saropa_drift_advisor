# BUG: `/api/sql/explain` runs an unbounded, untimed N+1 PRAGMA sweep on the instrumented (user) query path

**Status: Open**

Created: 2026-09-02
Component: Server
File: `lib/src/server/sql_handler.dart` (lines ~196-225)
Severity: Performance

---

## Summary

After running `EXPLAIN QUERY PLAN`, `SqlHandler.explainSqlResult` extracts every referenced table and
then issues `PRAGMA index_list(<table>)` per table plus `PRAGMA index_info(<index>)` per index —
sequentially, with `await` inside nested loops. Three separate defects compound here:

1. **N+1 / unbounded fan-out.** A query joining 10 tables with 5 indexes each costs 61 round-trips.
2. **No timeout.** The `EXPLAIN` itself is wrapped in `.timeout(_ctx.sqlStatementTimeout)`; the
   PRAGMA loop is not. A hang there re-opens the exact all-endpoints wedge the timeout was added to
   close.
3. **Wrong instrumentation.** The PRAGMAs go through the caller-supplied `query` (the instrumented
   user path), not `_ctx.internalQuery`, so the advisor's own metadata probes are recorded as user
   query timings. The handler's own comment at `sql_handler.dart:230-232` claims "Explain plans never
   feed into perf analysis, so the isInternal flag on the body is intentionally ignored here" —
   ignoring the flag is precisely what makes them feed into perf analysis.

---

## Attribution Evidence

```bash
# Positive — the N+1 PRAGMA loop
grep -n "PRAGMA index_list\|PRAGMA index_info" lib/src/server/sql_handler.dart
# 202:            'PRAGMA index_list(${ServerUtils.quoteIdent(tableName)})',
# 212:              'PRAGMA index_info(${ServerUtils.quoteIdent(idxName)})',

# The timeout applied to EXPLAIN but not to the PRAGMA loop
grep -n "sqlStatementTimeout" lib/src/server/sql_handler.dart
# 74:          ? await _ctx.internalQuery(sql).timeout(_ctx.sqlStatementTimeout)
# 80:            ).timeout(_ctx.sqlStatementTimeout);
# 175:      ).timeout(_ctx.sqlStatementTimeout);
#   (line 175 is the EXPLAIN; lines 202 and 212 have no .timeout)

# The PRAGMAs use the instrumented callback, not internalQuery
grep -n "await query(" lib/src/server/sql_handler.dart
# 174:      final dynamic raw = await query(
# 201:          await query(
# 211:          await query(

# The perf handler DOES filter PRAGMAs out of aggregates — but they still occupy
# the 500-entry ring and evict real app queries
grep -n "_isIntrospection\|maxQueryTimings" lib/src/server/performance_handler.dart lib/src/server/server_constants.dart
# lib/src/server/performance_handler.dart:33:    final workloadTimings = timings.where((t) => !_isIntrospection(t)).toList();
# lib/src/server/server_constants.dart:11:  static const int maxQueryTimings = 500;
```

**Emit site(s) — list ALL:** `lib/src/server/sql_handler.dart:201`, `:211`. Reached from
`POST /api/sql/explain` (`lib/src/server/router.dart:637`) and from the VM-service RPC
`Router.explainSqlResult` (`lib/src/server/router.dart:1200`).
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

1. Open the web viewer's SQL console against a schema with ≥10 tables and several indexes each.
2. Run **Explain** on a query joining them, e.g.
   `SELECT * FROM a JOIN b ON ... JOIN c ON ... JOIN d ON ...`.
3. Open `GET /api/analytics/performance` and `GET /api/history` immediately afterwards.

---

## Expected Behavior

The index metadata should be gathered in a bounded number of round-trips, be subject to the same
statement timeout as the `EXPLAIN`, and be attributed to `internalQuery` so it never appears as user
workload.

---

## Actual Behavior

- One `PRAGMA index_list` per referenced table plus one `PRAGMA index_info` per index, all awaited
  serially. On a wide join this is dozens of round-trips for a single "Explain" click; each one is a
  full request/response through the host's Drift executor.
- Any one of them can hang indefinitely, holding the HTTP connection open — the wedge signature
  documented in
  `plans/history/2026.06/2026.06.24/BUG_loopback_server_wedges_and_hard_to_discover_for_agents.md`.
- All of them land in `ServerContext.queryTimings` (cap 500) as non-internal timings. They are
  filtered out of the *aggregates* by `PerformanceHandler._isIntrospection`, but they are not
  filtered out of the *ring*, so a handful of Explain clicks evicts the real application timings the
  performance panel exists to show — the same eviction failure recorded for the schema browser in
  `plans/history/2026.07/2026.07.24/BUG_EXPORT_PERF_SECTION_FALSE_POSITIVES.md` (Finding 2).

---

## Error Output

No error. The symptom is latency on Explain and an emptied/short performance window afterwards.

---

## Duplicate-Emission Check

Dart-only. The extension calls the endpoint; it does not duplicate the PRAGMA sweep.

---

## What I Already Tried

- [x] Confirmed only line 175 carries `.timeout(...)`; lines 201 and 211 do not
- [x] Confirmed `query` here is `_ctx.instrumentedQuery` (passed from `Router._dispatch`, line ~217)
- [x] Confirmed `recordTiming` appends unconditionally for non-internal calls and evicts by count

---

## Regression Info

- Last working version:
- First broken version:
- What changed: the statement timeout was added to `runSqlResult` and to the `EXPLAIN` call but the
  metadata loop below it was not revisited

---

## Root Cause

The index-metadata enrichment was added after the timeout/instrumentation hardening and reused the
caller's `query` parameter because it was in scope.

**Proposed fix sketch:**

1. Replace the per-table/per-index PRAGMAs with two queries against `sqlite_master` /
   `pragma_index_list` / `pragma_index_info` table-valued functions, e.g.
   `SELECT m.name AS tbl, il.name AS idx, il."unique", ii.name AS col
    FROM sqlite_master m, pragma_index_list(m.name) il, pragma_index_info(il.name) ii
    WHERE m.type='table' AND m.name IN (...)`
   — one round-trip instead of 1 + N + M. Fall back to the loop only if the host's SQLite predates
   table-valued PRAGMA functions.
2. Route the metadata query through `_ctx.internalQuery`, and wrap it in
   `.timeout(_ctx.sqlStatementTimeout)`.
3. Fix the comment at `sql_handler.dart:230-232`, which currently states the opposite of what the
   code does.
4. Cache the per-table index metadata for the lifetime of a generation (invalidated by
   `ServerContext.invalidateTableNameCache`) — Explain is typically re-run repeatedly on the same
   tables while a developer iterates on a query.

---

## Changes Made

<!-- Fill in when a fix is written. -->

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- Who is affected: every user of the Explain feature on a non-trivial schema.
- What is blocked: nothing hard-blocked; Explain becomes slow and pollutes/evicts performance data.
- Data risk: none.
- Frequency: every Explain invocation.
