/**
 * Detects query performance regressions by comparing current session
 * data against stored baselines. Pure functions for easy testing.
 */

import * as vscode from 'vscode';
import type { PerformanceData, QueryEntry } from '../api-types';
import type { PerfBaselineStore } from './perf-baseline-store';
import { normalizeSql, truncateSql } from '../diagnostics/utils/sql-utils';

export interface IRegressionResult {
  sql: string;
  normalizedSql: string;
  currentAvgMs: number;
  baselineAvgMs: number;
  /** currentAvg / baselineAvg */
  ratio: number;
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

  for (const [key, { totalMs, count, exampleSql }] of aggregates) {
    const baseline = store.get(key);
    if (!baseline || baseline.sampleCount < 1 || baseline.avgDurationMs <= 0) continue;

    const currentAvg = totalMs / count;
    const ratio = currentAvg / baseline.avgDurationMs;

    if (ratio >= threshold) {
      regressions.push({
        sql: exampleSql,
        normalizedSql: key,
        currentAvgMs: Math.round(currentAvg),
        baselineAvgMs: Math.round(baseline.avgDurationMs),
        ratio: Math.round(ratio * 100) / 100,
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
  for (const [key, { totalMs, count }] of aggregates) {
    store.record(key, totalMs / count);
  }
}

/**
 * Show a VS Code warning notification listing regressions.
 */
export function showRegressionWarning(
  regressions: IRegressionResult[],
): void {
  if (regressions.length === 0) return;
  const top = regressions.slice(0, 3);
  const lines = top.map(
    (r) =>
      `  "${truncateSql(r.sql, 40)}": ${r.currentAvgMs}ms vs baseline ${r.baselineAvgMs}ms (${r.ratio}x)`,
  );
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
  count: number;
  exampleSql: string;
}

function aggregateQueries(
  queries: QueryEntry[],
): Map<string, IAggregateEntry> {
  const map = new Map<string, IAggregateEntry>();
  for (const q of queries) {
    const key = normalizeSql(q.sql);
    const existing = map.get(key);
    if (existing) {
      existing.totalMs += q.durationMs;
      existing.count += 1;
    } else {
      map.set(key, { totalMs: q.durationMs, count: 1, exampleSql: q.sql });
    }
  }
  return map;
}
