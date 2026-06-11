/**
 * Side-effecting actions for the DVR panel: export the timeline, open the
 * selected SQL in an editor / SQL Notebook / cost analyzer, and feed refreshed
 * DVR queries into Query Intelligence and perf-regression baselines. Extracted
 * from dvr-panel.ts so the panel class stays focused on state + routing.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { IRecordedQueryV1 } from '../api-types';
import type { QueryIntelligence } from '../engines/query-intelligence';
import { SqlNotebookPanel } from '../sql-notebook/sql-notebook-panel';
import {
  buildPerformanceDataFromDvrQueries,
  detectRegressions,
  recordDvrQueriesIntoPerfBaselines,
  showRegressionWarning,
} from '../debug/perf-regression-detector';
import type { PerfBaselineStore } from '../debug/perf-baseline-store';

/** Open the recorded timeline as a JSON document. */
export async function exportTimeline(timeline: IRecordedQueryV1[]): Promise<void> {
  const payload = JSON.stringify(timeline, null, 2);
  const doc = await vscode.workspace.openTextDocument({ content: payload, language: 'json' });
  await vscode.window.showTextDocument(doc, { preview: true });
}

/** Open the given SQL in a preview editor. */
export async function openSqlInEditor(sql: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument({ content: sql, language: 'sql' });
  await vscode.window.showTextDocument(doc, { preview: true });
}

/** Send the given SQL to the SQL Notebook as a new query tab. */
export function openSqlInNotebook(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
  sql: string,
  focusedId: number | null,
): void {
  SqlNotebookPanel.showAndInsertQuery(context, client, {
    sql,
    title: `DVR #${focusedId ?? ''}`,
    source: 'dvr',
  });
}

/** Run cost / EXPLAIN analysis for the given SQL. */
export async function analyzeSqlCost(sql: string): Promise<void> {
  await vscode.commands.executeCommand('driftViewer.analyzeQueryCost', sql);
}

/**
 * Feed refreshed DVR queries into Query Intelligence and (when enabled) the perf
 * baseline store, optionally surfacing a regression warning. Mirrors the prior
 * inline behavior in [DvrPanel._refresh].
 */
export function applyDvrPerfTracking(
  queries: IRecordedQueryV1[],
  queryIntelligence: QueryIntelligence | undefined,
  store: PerfBaselineStore | undefined,
): void {
  queryIntelligence?.recordFromDvrQueries(queries);

  const perfCfg = vscode.workspace.getConfiguration('driftViewer.perfRegression');
  if (store && perfCfg.get<boolean>('recordBaselinesFromDvr', true)) {
    recordDvrQueriesIntoPerfBaselines(queries, store);
  }
  if (
    store &&
    perfCfg.get<boolean>('warnOnDvrPanelRefresh', false) &&
    perfCfg.get<boolean>('enabled', true)
  ) {
    const threshold = perfCfg.get<number>('threshold', 2) ?? 2;
    const slowMs =
      vscode.workspace.getConfiguration('driftViewer.performance').get<number>('slowThresholdMs', 500) ??
      500;
    const data = buildPerformanceDataFromDvrQueries(queries, slowMs);
    const hits = detectRegressions(data, store, threshold);
    if (hits.length > 0) {
      showRegressionWarning(hits);
    }
  }
}
