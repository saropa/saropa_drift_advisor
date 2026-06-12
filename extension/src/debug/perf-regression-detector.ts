/**
 * Detects query performance regressions by comparing current session
 * data against stored baselines. Pure functions for easy testing.
 */

import * as vscode from 'vscode';
import type { IRecordedQueryV1, PerformanceData, QueryEntry } from '../api-types';
import type { PerfBaselineStore } from './perf-baseline-store';
import { normalizeSql, truncateSql } from '../diagnostics/utils/sql-utils';

export interface IRegressionResult {
  sql: string;
  normalizedSql: string;
  currentAvgMs: number;
  baselineAvgMs: number;
  /**
   * The slowdown factor that crossed the threshold. When `rowCountNormalized`
   * is true this is the *per-row* ratio (current ms/row ÷ baseline ms/row);
   * otherwise it is the raw `currentAvg / baselineAvg`.
   */
  ratio: number;
  /** Average result rows this session (rounded). */
  currentRowCount: number;
  /** Average result rows in the baseline, or undefined if never tracked. */
  baselineRowCount?: number;
  /**
   * True when `ratio` was computed per-row because both the baseline and this
   * session returned a positive row count — i.e. table growth was factored out.
   */
  rowCountNormalized: boolean;
}

/**
 * Analyze session performance data against stored baselines.
 * Returns regressions (queries whose avg duration >= threshold * baseline).
 */
export function detectRegressions(
  data: PerformanceData,
  store: PerfBaselineStore,
  threshold: number,
): IRegressionResult[] {
  const aggregates = aggregateQueries([
    ...data.slowQueries,
    ...data.recentQueries,
  ]);
  const regressions: IRegressionResult[] = [];

  for (const [key, { totalMs, totalRows, count, exampleSql }] of aggregates) {
    const baseline = store.get(key);
    if (!baseline || baseline.sampleCount < 1 || baseline.avgDurationMs <= 0) continue;

    const currentAvg = totalMs / count;
    const currentRows = count > 0 ? totalRows / count : 0;
    const baselineRows =
      typeof baseline.avgRowCount === 'number' ? baseline.avgRowCount : undefined;

    // Normalize by result-row count when both the baseline and this session
    // returned a positive number of rows. A query that returns more rows simply
    // because its table grew costs proportionally more wall-time; comparing
    // per-row cost cancels that growth, so we only warn on a genuine per-row
    // slowdown — not on table growth (or a cold page cache enlarging an honest
    // result set). Aggregates that return one row both sessions reduce to the
    // raw ratio (per-row == raw). Baselines recorded before row-count tracking
    // have no avgRowCount and fall back to the raw comparison, unchanged.
    // See BUG_perf_regression_false_positives_from_data_quality_probes.md
    // (Suggestion #2, deferred from the 2026-04-21 isInternal fix).
    let ratio: number;
    let rowCountNormalized = false;
    if (baselineRows !== undefined && baselineRows > 0 && currentRows > 0) {
      const basePerRow = baseline.avgDurationMs / baselineRows;
      const curPerRow = currentAvg / currentRows;
      if (basePerRow > 0) {
        ratio = curPerRow / basePerRow;
        rowCountNormalized = true;
      } else {
        ratio = currentAvg / baseline.avgDurationMs;
      }
    } else {
      ratio = currentAvg / baseline.avgDurationMs;
    }

    if (ratio >= threshold) {
      regressions.push({
        sql: exampleSql,
        normalizedSql: key,
        currentAvgMs: Math.round(currentAvg),
        baselineAvgMs: Math.round(baseline.avgDurationMs),
        ratio: Math.round(ratio * 100) / 100,
        currentRowCount: Math.round(currentRows),
        baselineRowCount:
          baselineRows !== undefined ? Math.round(baselineRows) : undefined,
        rowCountNormalized,
      });
    }
  }

  return regressions.sort((a, b) => b.ratio - a.ratio);
}

/**
 * Record all queries from this session into the baseline store.
 */
export function recordSessionBaselines(
  data: PerformanceData,
  store: PerfBaselineStore,
): void {
  const aggregates = aggregateQueries([
    ...data.slowQueries,
    ...data.recentQueries,
  ]);
  for (const [key, { totalMs, totalRows, count }] of aggregates) {
    store.record(key, totalMs / count, totalRows / count);
  }
}

/**
 * Merges DVR timeline rows into [PerfBaselineStore] using the same
 * [normalizeSql] keys as session perf aggregation — feeds regression
 * detection without a separate capture pipeline.
 */
export function recordDvrQueriesIntoPerfBaselines(
  queries: readonly IRecordedQueryV1[],
  store: PerfBaselineStore,
): void {
  for (const q of queries) {
    const sql = typeof q.sql === 'string' ? q.sql.trim() : '';
    if (!sql) continue;
    const dur = typeof q.durationMs === 'number' ? q.durationMs : Number(q.durationMs);
    if (!Number.isFinite(dur) || dur < 0) continue;
    const key = normalizeSql(sql);
    if (key.length === 0) continue;
    // A SELECT's work scales with the rows it returns; a write's with the rows
    // it touches. Feed whichever applies so DVR-sourced baselines carry a row
    // count and participate in per-row normalization like live sessions.
    const rows = q.type === 'select' ? q.resultRowCount : q.affectedRowCount;
    store.record(key, dur, Number.isFinite(rows) ? rows : undefined);
  }
}

/**
 * Builds [PerformanceData] from DVR rows so [detectRegressions] can run
 * against the same baseline store as server-sourced perf snapshots.
 */
export function buildPerformanceDataFromDvrQueries(
  queries: readonly IRecordedQueryV1[],
  slowThresholdMs: number,
): PerformanceData {
  const recentQueries: QueryEntry[] = [];
  for (const q of queries) {
    const sql = typeof q.sql === 'string' ? q.sql.trim() : '';
    if (!sql) continue;
    const dur = typeof q.durationMs === 'number' ? q.durationMs : Number(q.durationMs);
    if (!Number.isFinite(dur) || dur < 0) continue;
    recentQueries.push({
      sql,
      durationMs: dur,
      rowCount: q.type === 'select' ? q.resultRowCount : q.affectedRowCount,
      at: q.timestamp,
      isInternal: false,
    });
  }
  const slowQueries = recentQueries.filter((e) => e.durationMs >= slowThresholdMs);
  const totalDurationMs = recentQueries.reduce((a, e) => a + e.durationMs, 0);
  return {
    totalQueries: recentQueries.length,
    totalDurationMs,
    avgDurationMs:
      recentQueries.length > 0 ? totalDurationMs / recentQueries.length : 0,
    slowQueries,
    recentQueries,
  };
}

/**
 * Show a VS Code warning notification listing regressions.
 */
export function showRegressionWarning(
  regressions: IRegressionResult[],
): void {
  if (regressions.length === 0) return;
  const top = regressions.slice(0, 3);
  const lines = top.map((r) => {
    const sql = truncateSql(r.sql, 40);
    // When the ratio is per-row, spell out the row counts so the reader sees
    // the slowdown is not just the table growing — otherwise "250ms vs 100ms
    // (1.1x)" reads as inconsistent next to the raw millisecond figures.
    if (r.rowCountNormalized) {
      return `  "${sql}": ${r.ratio}x slower per row (${r.currentAvgMs}ms/${r.currentRowCount} rows vs baseline ${r.baselineAvgMs}ms/${r.baselineRowCount} rows)`;
    }
    return `  "${sql}": ${r.currentAvgMs}ms vs baseline ${r.baselineAvgMs}ms (${r.ratio}x)`;
  });
  const suffix =
    regressions.length > 3
      ? `\n  ...and ${regressions.length - 3} more`
      : '';
  vscode.window.showWarningMessage(
    `Drift: ${regressions.length} query regression(s) detected:\n${lines.join('\n')}${suffix}`,
  );
}

// ---- internal helpers ----

interface IAggregateEntry {
  totalMs: number;
  totalRows: number;
  count: number;
  exampleSql: string;
}

function aggregateQueries(
  queries: QueryEntry[],
): Map<string, IAggregateEntry> {
  const map = new Map<string, IAggregateEntry>();
  for (const q of queries) {
    // Skip extension-owned diagnostic probes (null-count scans,
    // health-metrics aggregates, column profiler bursts). These are
    // tagged with `isInternal: true` by the server when the extension
    // passes `{ internal: true }` on the sql() call. Without this filter
    // every debug session produces a warning shaped like "regression:
    // SUM(CASE WHEN "id" IS NULL THEN 1 …) 55ms vs baseline 6ms (9x)"
    // where the probe is being compared to a baseline it wrote itself
    // in the previous session — a feedback loop that makes the warning
    // useless. See BUG_perf_regression_false_positives_from_data_quality_probes.md.
    // Also applied symmetrically in `recordSessionBaselines` so we don't
    // poison future baselines with extension-owned timings.
    if (q.isInternal) continue;
    const key = normalizeSql(q.sql);
    const rows = Number.isFinite(q.rowCount) ? q.rowCount : 0;
    const existing = map.get(key);
    if (existing) {
      existing.totalMs += q.durationMs;
      existing.totalRows += rows;
      existing.count += 1;
    } else {
      map.set(key, {
        totalMs: q.durationMs,
        totalRows: rows,
        count: 1,
        exampleSql: q.sql,
      });
    }
  }
  return map;
}
