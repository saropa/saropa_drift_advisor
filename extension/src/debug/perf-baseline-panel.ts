/**
 * Singleton webview panel for Performance Baselines.
 * Replaces the old showQuickPick-based display with a sortable table.
 */

import * as vscode from 'vscode';
import type { PerfBaselineStore, IPerfBaseline } from './perf-baseline-store';
import { buildPerfBaselineHtml } from './perf-baseline-html';

/** Singleton panel showing performance baselines in a rich table. */
export class PerfBaselinePanel {
  private static _currentPanel: PerfBaselinePanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _store: PerfBaselineStore;
  /** Snapshot taken at panel open / after mutations, used for index-based reset. */
  private _sorted: IPerfBaseline[];

  static createOrShow(store: PerfBaselineStore): void {
    const column = vscode.ViewColumn.Active;

    if (PerfBaselinePanel._currentPanel) {
      PerfBaselinePanel._currentPanel._refresh();
      PerfBaselinePanel._currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'driftPerfBaselines',
      'Performance Baselines',
      column,
      { enableScripts: true },
    );
    PerfBaselinePanel._currentPanel = new PerfBaselinePanel(panel, store);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    store: PerfBaselineStore,
  ) {
    this._panel = panel;
    this._store = store;
    this._sorted = [];

    this._panel.onDidDispose(
      () => this._dispose(), null, this._disposables,
    );
    this._panel.webview.onDidReceiveMessage(
      (msg) => this._handleMessage(msg),
      null,
      this._disposables,
    );

    // Re-render when baselines change externally
    const sub = store.onDidChange(() => this._refresh());
    this._disposables.push(sub);

    this._refresh();
  }

  private _refresh(): void {
    // Snapshot the current baselines sorted by avg duration descending
    this._sorted = Array.from(this._store.baselines.values())
      .sort((a, b) => b.avgDurationMs - a.avgDurationMs);
    this._panel.webview.html = buildPerfBaselineHtml(this._sorted);
  }

  private async _handleMessage(
    msg: { command: string; index?: number },
  ): Promise<void> {
    switch (msg.command) {
      case 'resetOne': {
        if (msg.index !== undefined && this._sorted[msg.index]) {
          this._store.resetOne(this._sorted[msg.index].normalizedSql);
          // Store fires onDidChange which triggers _refresh
        }
        break;
      }
      case 'resetAll': {
        if (this._store.size === 0) break;
        const confirm = await vscode.window.showWarningMessage(
          `Reset all ${this._store.size} performance baselines?`,
          { modal: true },
          'Reset All',
        );
        if (confirm === 'Reset All') {
          this._store.resetAll();
        }
        break;
      }
    }
  }

  private _dispose(): void {
    PerfBaselinePanel._currentPanel = undefined;
    this._panel.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}
