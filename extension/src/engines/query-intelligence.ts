/**
 * QueryIntelligence: Centralized query pattern analysis and suggestions.
 *
 * Features:
 * - Accumulates query patterns from performance tracking
 * - Auto-analyzes slow queries with cost analyzer
 * - Suggests indexes based on accumulated WHERE/JOIN patterns
 * - Improves autocomplete based on query history
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { IRecordedQueryV1, PerformanceData, QueryEntry } from '../api-types';
import type { IJoinPattern, IPatternIndexSuggestion, IQueryPattern } from './query-intelligence-types';
import { normalizeQuery, parseQuery } from './query-intelligence-parser';

/** Cache TTL in milliseconds (15 seconds). */
const CACHE_TTL_MS = 15_000;

export class QueryIntelligence implements vscode.Disposable {
  private _patterns = new Map<string, IQueryPattern>();
  private _perfCache: PerformanceData | undefined;
  private _perfCacheTime = 0;
  /**
   * ISO timestamp of the newest server query already folded into [_patterns].
   * Each cache refresh re-fetches the whole rolling perf window; without this
   * cursor every refresh re-ingested every query, inflating executionCount /
   * totalDurationMs (and thus the slow-query and index advice) on every TTL
   * expiry. ISO-8601 UTC strings sort chronologically, so a `>` compare admits
   * only genuinely newer queries. See plans/history/2026.06/2026.06.12/full-codebase-audit-2026.06.12.md M3.
   */
  private _lastIngestedAt = '';

  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  private readonly _disposables: vscode.Disposable[] = [];

  constructor(private readonly _client: DriftApiClient) {
    this._disposables.push(this._onDidChange);
  }

  /** Record a query execution for pattern analysis. */
  recordQuery(sql: string, durationMs: number, rowCount: number): void {
    this._ingestOneQuery(sql, durationMs, rowCount);
    this._onDidChange.fire();
  }

  /**
   * Ingests DVR timeline rows into the same pattern store as [recordQuery],
   * firing a single change event for the batch (avoids UI churn on large pages).
   */
  recordFromDvrQueries(queries: readonly IRecordedQueryV1[]): void {
    if (queries.length === 0) {
      return;
    }
    for (const q of queries) {
      const rows = q.type === 'select' ? q.resultRowCount : q.affectedRowCount;
      this._ingestOneQuery(q.sql, q.durationMs, rows);
    }
    this._onDidChange.fire();
  }

  private _ingestOneQuery(sql: string, durationMs: number, _rowCount: number): void {
    const normalized = normalizeQuery(sql);
    const existing = this._patterns.get(normalized);

    if (existing) {
      existing.executionCount++;
      existing.totalDurationMs += durationMs;
      existing.avgDurationMs = existing.totalDurationMs / existing.executionCount;
      existing.lastSeen = Date.now();
    } else {
      const parsed = parseQuery(sql);
      this._patterns.set(normalized, {
        pattern: normalized,
        tables: parsed.tables,
        whereColumns: parsed.whereColumns,
        joinColumns: parsed.joinColumns,
        orderByColumns: parsed.orderByColumns,
        executionCount: 1,
        totalDurationMs: durationMs,
        avgDurationMs: durationMs,
        lastSeen: Date.now(),
      });
    }
  }

  /** Get slow query patterns (avg > threshold). */
  async getSlowPatterns(thresholdMs = 100): Promise<IQueryPattern[]> {
    const perf = await this._getPerformance();
    const patterns: IQueryPattern[] = [];

    for (const q of perf.slowQueries) {
      const normalized = normalizeQuery(q.sql);
      const existing = this._patterns.get(normalized);
      if (existing && existing.avgDurationMs > thresholdMs) {
        patterns.push(existing);
      }
    }

    return patterns.sort((a, b) => b.avgDurationMs - a.avgDurationMs);
  }

  /** Suggest indexes based on accumulated query patterns. */
  async getSuggestedIndexes(): Promise<IPatternIndexSuggestion[]> {
    const suggestions: IPatternIndexSuggestion[] = [];
    const columnUsage = new Map<string, { count: number; totalMs: number }>();

    for (const [, pattern] of this._patterns) {
      for (const table of pattern.tables) {
        for (const col of pattern.whereColumns) {
          const key = `${table}.${col}`;
          const existing = columnUsage.get(key) ?? { count: 0, totalMs: 0 };
          existing.count += pattern.executionCount;
          existing.totalMs += pattern.totalDurationMs;
          columnUsage.set(key, existing);
        }
      }
    }

    for (const [key, usage] of columnUsage) {
      if (usage.count >= 3) {
        const [table, column] = key.split('.');
        suggestions.push({
          table,
          column,
          reason: `Used in WHERE clause ${usage.count} times`,
          usageCount: usage.count,
          potentialSavingsMs: usage.totalMs * 0.3,
          sql: `CREATE INDEX IF NOT EXISTS "idx_${table}_${column}" ON "${table}" ("${column}");`,
        });
      }
    }

    return suggestions.sort((a, b) => b.potentialSavingsMs - a.potentialSavingsMs);
  }

  /** Get frequently used tables for autocomplete prioritization. */
  getFrequentTables(): string[] {
    const tableUsage = new Map<string, number>();

    for (const [, pattern] of this._patterns) {
      for (const table of pattern.tables) {
        tableUsage.set(table, (tableUsage.get(table) ?? 0) + pattern.executionCount);
      }
    }

    return Array.from(tableUsage.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([table]) => table);
  }

  /** Get frequent join patterns for autocomplete. */
  getFrequentJoins(): IJoinPattern[] {
    const joins = new Map<string, IJoinPattern>();

    for (const [, pattern] of this._patterns) {
      if (pattern.tables.length < 2) continue;

      for (let i = 0; i < pattern.tables.length - 1; i++) {
        const from = pattern.tables[i];
        const to = pattern.tables[i + 1];
        const key = `${from}→${to}`;

        const existing = joins.get(key);
        if (existing) {
          existing.usageCount += pattern.executionCount;
        } else {
          joins.set(key, {
            fromTable: from,
            toTable: to,
            joinClause: `JOIN "${to}" ON "${from}".id = "${to}".${from}_id`,
            usageCount: pattern.executionCount,
          });
        }
      }
    }

    return Array.from(joins.values())
      .sort((a, b) => b.usageCount - a.usageCount);
  }

  /** Analyze a specific query and provide suggestions. */
  async analyzeQuery(sql: string): Promise<{
    pattern: IQueryPattern | undefined;
    suggestions: string[];
  }> {
    const normalized = normalizeQuery(sql);
    const pattern = this._patterns.get(normalized);
    const suggestions: string[] = [];

    const parsed = parseQuery(sql);

    if (parsed.whereColumns.length > 0 && parsed.tables.length > 0) {
      for (const col of parsed.whereColumns) {
        for (const table of parsed.tables) {
          suggestions.push(
            `Consider index on ${table}.${col} if not already indexed`,
          );
        }
      }
    }

    if (parsed.orderByColumns.length > 0 && !parsed.orderByColumns.some(
      (c) => parsed.whereColumns.includes(c),
    )) {
      suggestions.push(
        'ORDER BY column differs from WHERE columns - may cause sort operation',
      );
    }

    return { pattern, suggestions };
  }

  /** Get recent queries for history-based autocomplete. */
  async getRecentQueries(limit = 20): Promise<QueryEntry[]> {
    const perf = await this._getPerformance();
    return perf.recentQueries?.slice(0, limit) ?? [];
  }

  /** Clear accumulated patterns. */
  clear(): void {
    this._patterns.clear();
    this._perfCache = undefined;
    this._lastIngestedAt = '';
    this._onDidChange.fire();
  }

  private async _getPerformance(): Promise<PerformanceData> {
    const now = Date.now();
    if (this._perfCache && (now - this._perfCacheTime) < CACHE_TTL_MS) {
      return this._perfCache;
    }

    this._perfCache = await this._client.performance();
    this._perfCacheTime = now;

    // Fold in only queries newer than the last one already ingested, so a query
    // is counted exactly once across refreshes (the perf window is re-fetched
    // whole each time). Advance the cursor to the newest `at` seen.
    let newestAt = this._lastIngestedAt;
    for (const q of this._perfCache.recentQueries ?? []) {
      if (q.at <= this._lastIngestedAt) continue;
      this.recordQuery(q.sql, q.durationMs, q.rowCount ?? 0);
      if (q.at > newestAt) newestAt = q.at;
    }
    this._lastIngestedAt = newestAt;

    return this._perfCache;
  }

  dispose(): void {
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}
