/**
 * Query Replay DVR panel.
 *
 * Timeline stepping, selection detail (via `/api/dvr/query`), filters, export,
 * SQL editor / SQL Notebook / Query Cost integration, and schema-generation refresh.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { IRecordedQueryV1 } from '../api-types';
import type { QueryIntelligence } from '../engines/query-intelligence';
import { SqlNotebookPanel } from '../sql-notebook/sql-notebook-panel';
import { refreshDvrStatusBar } from './dvr-status-bar';
import { buildDvrPanelHtml } from './dvr-html';
import { filterRecordedQueries, type DvrQueryKindFilter } from './dvr-search';
import {
  buildPerformanceDataFromDvrQueries,
  detectRegressions,
  recordDvrQueriesIntoPerfBaselines,
  showRegressionWarning,
} from '../debug/perf-regression-detector';
import type { PerfBaselineStore } from '../debug/perf-baseline-store';

const _kDetailJsonMax = 12_000;

type DvrWebviewMessage =
  | { command: 'ready' }
  | { command: 'start' }
  | { command: 'pause' }
  | { command: 'stop' }
  | { command: 'refresh' }
  | { command: 'export' }
  | { command: 'openSql' }
  | { command: 'openNotebook' }
  | { command: 'analyzeCost' }
  | { command: 'openSnapshotDiff' }
  | { command: 'openSchemaRollback' }
  | { command: 'filters'; text?: string; kind?: string; table?: string }
  | { command: 'select'; id?: number; sessionId?: string }
  | { command: 'step'; which?: string };

export class DvrPanel {
  private static _currentPanel: DvrPanel | undefined;
  private static _queryIntelligence: QueryIntelligence | undefined;
  private static _perfBaselineStore: PerfBaselineStore | undefined;

  /** Optional hook so DVR refreshes enrich Query Intelligence patterns. */
  static setQueryIntelligence(intel: QueryIntelligence | undefined): void {
    DvrPanel._queryIntelligence = intel;
  }

  /** Same store as debug perf baselines — DVR refresh can merge timings into it. */
  static setPerfBaselineStore(store: PerfBaselineStore | undefined): void {
    DvrPanel._perfBaselineStore = store;
  }

  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];
  private _queries: IRecordedQueryV1[] = [];
  private _recording = false;
  private _sessionId = '';
  private _count = 0;
  private _maxQueries: number | undefined;
  private _captureBeforeAfter: boolean | undefined;
  private _error = '';
  private _searchText = '';
  private _kindFilter: DvrQueryKindFilter = 'all';
  private _tableFilter = '';
  private _focusedId: number | null = null;
  private _detailHtml = '';

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly _client: DriftApiClient,
    private readonly _extensionContext: vscode.ExtensionContext,
  ) {
    this._panel = panel;
    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage((msg) => {
      void this._onMessage(msg as DvrWebviewMessage);
    }, null, this._disposables);
  }

  static refreshIfVisible(): void {
    void DvrPanel._currentPanel?._refresh();
  }

  static createOrShow(
    extensionContext: vscode.ExtensionContext,
    client: DriftApiClient,
  ): void {
    const column = vscode.ViewColumn.Beside;
    if (DvrPanel._currentPanel) {
      DvrPanel._currentPanel._panel.reveal(column);
      void DvrPanel._currentPanel._refresh();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'driftViewerDvr',
      'Query Replay DVR',
      column,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    DvrPanel._currentPanel = new DvrPanel(panel, client, extensionContext);
    DvrPanel._currentPanel._render();
    void DvrPanel._currentPanel._refresh();
  }

  private _timeline(): IRecordedQueryV1[] {
    const f = filterRecordedQueries(this._queries, {
      text: this._searchText,
      kind: this._kindFilter,
      tableSubstring: this._tableFilter,
    });
    return [...f].sort((a, b) => a.id - b.id);
  }

  private async _syncFocusAfterRefresh(): Promise<void> {
    const t = this._timeline();
    if (t.length === 0) {
      this._focusedId = null;
      this._detailHtml = '';
      this._render();
      return;
    }
    if (this._focusedId !== null && t.some((q) => q.id === this._focusedId)) {
      await this._fetchDetail(this._sessionId, this._focusedId);
      return;
    }
    this._focusedId = t[t.length - 1].id;
    await this._fetchDetail(this._sessionId, this._focusedId);
  }

  private async _fetchDetail(sessionId: string, id: number): Promise<void> {
    try {
      const q = await this._client.dvrQuery(sessionId, id);
      const chunk = JSON.stringify(
        {
          params: q.params,
          beforeState: q.beforeState,
          afterState: q.afterState,
          meta: q.meta,
        },
        null,
        2,
      );
      const clipped = chunk.length > _kDetailJsonMax ? `${chunk.slice(0, _kDetailJsonMax)}…` : chunk;
      this._detailHtml = `<pre>${this._escapeHtml(clipped)}</pre>`;
    } catch {
      this._detailHtml = '<pre>(detail unavailable — id may have been evicted)</pre>';
    }
    this._render();
  }

  private _escapeHtml(s: string): string {
    return s
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  private _currentSql(): string | undefined {
    const t = this._timeline();
    const hit = t.find((q) => q.id === this._focusedId);
    return hit?.sql;
  }

  private async _onMessage(msg: DvrWebviewMessage): Promise<void> {
    try {
      switch (msg.command) {
        case 'ready':
        case 'refresh':
          await this._refresh();
          return;
        case 'start':
          await this._client.dvrStart();
          await this._refresh();
          void refreshDvrStatusBar(this._client);
          return;
        case 'pause':
        case 'stop':
          if (msg.command === 'pause') {
            await this._client.dvrPause();
          } else {
            await this._client.dvrStop();
          }
          await this._refresh();
          void refreshDvrStatusBar(this._client);
          return;
        case 'filters': {
          this._searchText = typeof msg.text === 'string' ? msg.text : '';
          const k = msg.kind;
          this._kindFilter = k === 'reads' || k === 'writes' ? k : 'all';
          this._tableFilter = typeof msg.table === 'string' ? msg.table : '';
          await this._syncFocusAfterRefresh();
          return;
        }
        case 'select': {
          const id = msg.id;
          const sid = msg.sessionId;
          if (typeof id !== 'number' || !sid) {
            return;
          }
          this._focusedId = id;
          await this._fetchDetail(sid, id);
          return;
        }
        case 'step': {
          const t = this._timeline();
          if (t.length === 0) {
            return;
          }
          const w = msg.which ?? 'next';
          let idx = this._focusedId === null ? -1 : t.findIndex((q) => q.id === this._focusedId);
          if (idx < 0) {
            idx = t.length - 1;
          }
          if (w === 'first') {
            idx = 0;
          } else if (w === 'last') {
            idx = t.length - 1;
          } else if (w === 'prev') {
            idx = Math.max(0, idx - 1);
          } else {
            idx = Math.min(t.length - 1, idx + 1);
          }
          const q = t[idx];
          this._focusedId = q.id;
          await this._fetchDetail(q.sessionId, q.id);
          return;
        }
        case 'export': {
          const payload = JSON.stringify(this._timeline(), null, 2);
          const doc = await vscode.workspace.openTextDocument({
            content: payload,
            language: 'json',
          });
          await vscode.window.showTextDocument(doc, { preview: true });
          return;
        }
        case 'openSql': {
          const sql = this._currentSql()?.trim();
          if (!sql) {
            void vscode.window.showInformationMessage('Select a query first (click a row or use timeline).');
            return;
          }
          const doc = await vscode.workspace.openTextDocument({
            content: sql,
            language: 'sql',
          });
          await vscode.window.showTextDocument(doc, { preview: true });
          return;
        }
        case 'openNotebook': {
          const sql = this._currentSql()?.trim();
          if (!sql) {
            void vscode.window.showInformationMessage('Select a query first.');
            return;
          }
          SqlNotebookPanel.showAndInsertQuery(this._extensionContext, this._client, {
            sql,
            title: `DVR #${this._focusedId ?? ''}`,
            source: 'dvr',
          });
          return;
        }
        case 'analyzeCost': {
          const sql = this._currentSql()?.trim();
          if (!sql) {
            void vscode.window.showInformationMessage('Select a query first.');
            return;
          }
          await vscode.commands.executeCommand('driftViewer.analyzeQueryCost', sql);
          return;
        }
        case 'openSnapshotDiff': {
          await vscode.commands.executeCommand('driftViewer.showSnapshotDiff');
          return;
        }
        case 'openSchemaRollback': {
          await vscode.commands.executeCommand('driftViewer.generateRollback');
          return;
        }
      }
    } catch (e) {
      this._error = e instanceof Error ? e.message : String(e);
      this._render();
    }
  }

  private async _refresh(): Promise<void> {
    const status = await this._client.dvrStatus();
    this._recording = status.recording;
    this._sessionId = status.sessionId;
    this._count = status.queryCount;
    this._maxQueries = status.maxQueries;
    this._captureBeforeAfter = status.captureBeforeAfter;
    const page = await this._client.dvrQueries({ limit: 500, direction: 'backward' });
    this._queries = page.queries;
    DvrPanel._queryIntelligence?.recordFromDvrQueries(this._queries);

    const perfCfg = vscode.workspace.getConfiguration('driftViewer.perfRegression');
    const store = DvrPanel._perfBaselineStore;
    if (store && perfCfg.get<boolean>('recordBaselinesFromDvr', true)) {
      recordDvrQueriesIntoPerfBaselines(this._queries, store);
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
      const data = buildPerformanceDataFromDvrQueries(this._queries, slowMs);
      const hits = detectRegressions(data, store, threshold);
      if (hits.length > 0) {
        showRegressionWarning(hits);
      }
    }

    this._error = '';
    await this._syncFocusAfterRefresh();
    void refreshDvrStatusBar(this._client);
  }

  private _render(): void {
    this._panel.webview.html = buildDvrPanelHtml({
      recording: this._recording,
      sessionId: this._sessionId,
      count: this._count,
      maxQueries: this._maxQueries,
      captureBeforeAfter: this._captureBeforeAfter,
      error: this._error,
      searchText: this._searchText,
      kindFilter: this._kindFilter,
      tableFilter: this._tableFilter,
      timelineQueries: this._timeline(),
      focusedId: this._focusedId,
      detailHtml: this._detailHtml,
    });
  }

  private _dispose(): void {
    DvrPanel._currentPanel = undefined;
    for (const d of this._disposables) d.dispose();
    this._disposables.length = 0;
  }
}
