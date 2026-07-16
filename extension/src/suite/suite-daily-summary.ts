/**
 * Saropa Suite daily-summary API (apiVersion 1).
 *
 * Saropa Workspace builds a consolidated "Suite daily report" and asks each
 * Suite tool to expose one small, data-returning API so it never scrapes
 * another tool's internals or on-disk state. This module is the Drift Advisor
 * side of that contract: a thin read-only projection of what the dashboard,
 * anomaly detector, and index analyzer already compute for the current
 * connected session — no new capture, no new logic.
 *
 * The exported shapes ({@link SaropaSuiteApi}, {@link DailySummary}) are a
 * cross-tool contract. Treat every emitted field with never-rename discipline,
 * the same as the documented `driftViewer.*` deep-link ids: `apiVersion` bumps
 * only on a breaking shape change; siblings ignore unknown fields, so growth is
 * additive.
 *
 * Per-day history is NOT retained. The server keeps a live session view (ring
 * buffers of query timings, current anomalies), so `getDailySummary(date)`
 * returns that session/snapshot view stamped with the requested `date`. This is
 * acceptable for apiVersion 1 (see
 * plans/history/2026.07/2026.07.16/PLAN_suite_daily_summary_api.md); a future
 * version may add true per-day retention without breaking callers.
 */

import type { DriftApiClient } from '../api-client';
import { LOG_CAPTURE_SESSION_TIMEOUT_MS } from '../debug/log-capture-utils';

/** Number of slow-query offenders surfaced in the Trouble section. Capped so
 *  the returned payload stays small — the caller wants a digest, not the full
 *  perf timeline (which it can fetch via {@link SaropaSuiteApi} siblings). */
const MAX_TROUBLE_SLOW_QUERIES = 5;

/** A single failure-only item for the caller's Trouble section. */
export interface DailySummaryTrouble {
  /** One-line human-readable label, e.g. "Slow query (812ms)". */
  label: string;
  /** Optional extra context (table name, SQL snippet). */
  detail?: string;
  /** Deep-link command id, e.g. 'driftViewer.showAnomalies'. */
  command?: string;
  /** Arguments passed to the deep-link command when invoked. */
  args?: unknown;
}

/** That day's digest of what Drift Advisor observed for one connected session. */
export interface DailySummary {
  /** Stable tool identifier within the Suite report. */
  tool: 'drift-viewer';
  /** Echo of the requested day (YYYY-MM-DD). */
  date: string;
  /** One plain-language sentence for the caller's executive summary. */
  headline: string;
  /** Named counts: queries, slowQueries, anomalies, indexSuggestions. */
  counts: Record<string, number>;
  /** Failure-only items (anomalies, slow-query offenders). */
  trouble: DailySummaryTrouble[];
  /** Deep-link to open the full Drift Advisor view. */
  openCommand?: string;
}

/** API object exposed via `getExtension('saropa.drift-viewer')?.exports`. */
export interface SaropaSuiteApi {
  /** Contract version. Bumps only on a breaking shape change. */
  apiVersion: 1;
  /**
   * Returns the day's summary when a database has been observed (a client is
   * connected), or `undefined` otherwise so the caller omits the section.
   * Built lazily on call — nothing is computed at activation.
   */
  getDailySummary(date: string): Promise<DailySummary | undefined>;
}

/** Race a promise against a timeout so a hung server can't stall the caller. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms),
    ),
  ]);
}

/**
 * Builds the daily summary from performance, anomalies, and index-suggestion
 * data fetched in parallel. Returns `undefined` when `client` is null (not
 * connected — no database observed). Individual failed fetches degrade to
 * empty/zero rather than failing the whole call, so a partial server still
 * yields a usable digest.
 */
export async function buildDailySummary(
  client: DriftApiClient | null,
  date: string,
): Promise<DailySummary | undefined> {
  // No connected client means no database has been observed — the caller
  // omits the Drift Advisor section entirely (plan acceptance criterion).
  if (!client) return undefined;

  const [perf, anomalies, indexSuggestions] = await Promise.all([
    withTimeout(client.performance(), LOG_CAPTURE_SESSION_TIMEOUT_MS).catch(() => null),
    withTimeout(client.anomalies(), LOG_CAPTURE_SESSION_TIMEOUT_MS).catch(() => null),
    withTimeout(client.indexSuggestions(), LOG_CAPTURE_SESSION_TIMEOUT_MS).catch(() => null),
  ]);

  const queryCount = perf?.totalQueries ?? 0;
  const slowQueries = perf?.slowQueries ?? [];
  const anomalyList = anomalies ?? [];
  const indexList = indexSuggestions ?? [];

  const counts: Record<string, number> = {
    queries: queryCount,
    slowQueries: slowQueries.length,
    anomalies: anomalyList.length,
    indexSuggestions: indexList.length,
  };

  // Anomalies first (correctness/data issues), then the worst slow queries.
  // Slow queries are sorted descending by duration and capped so the payload
  // stays a digest, not the full timeline.
  const trouble: DailySummaryTrouble[] = [
    ...anomalyList.map((a) => ({
      label: a.message,
      detail: a.table
        ? (a.column ? `${a.table}.${a.column}` : a.table)
        : undefined,
      command: 'driftViewer.showAnomalies',
    })),
    ...[...slowQueries]
      .sort((x, y) => y.durationMs - x.durationMs)
      .slice(0, MAX_TROUBLE_SLOW_QUERIES)
      .map((q) => ({
        label: `Slow query (${q.durationMs}ms)`,
        detail: q.sql.slice(0, 120),
        command: 'driftViewer.showQueryDetail',
        args: q,
      })),
  ];

  return {
    tool: 'drift-viewer',
    date,
    headline: buildHeadline(counts),
    counts,
    trouble,
    openCommand: 'driftViewer.openInPanel',
  };
}

/** Composes the one-sentence executive-summary line from the counts. */
function buildHeadline(counts: Record<string, number>): string {
  const { queries, slowQueries, anomalies, indexSuggestions } = counts;
  if (queries === 0 && anomalies === 0) {
    return 'No database activity observed this session.';
  }
  const parts = [`${queries} ${queries === 1 ? 'query' : 'queries'} observed`];
  if (slowQueries > 0) parts.push(`${slowQueries} slow`);
  if (anomalies > 0) {
    parts.push(`${anomalies} ${anomalies === 1 ? 'anomaly' : 'anomalies'}`);
  }
  if (indexSuggestions > 0) {
    parts.push(
      `${indexSuggestions} index ${indexSuggestions === 1 ? 'suggestion' : 'suggestions'}`,
    );
  }
  return `${parts.join(', ')}.`;
}
