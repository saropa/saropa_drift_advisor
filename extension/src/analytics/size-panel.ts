/**
 * Singleton webview panel for Database Size Analytics.
 * Supports saving snapshots and comparing analysis history.
 */

import * as vscode from 'vscode';
import type { ISizeAnalytics } from '../api-types';
import type { AnalysisHistoryStore } from '../analysis-history/analysis-history-store';
import { AnalysisComparePanel } from '../analysis-history/analysis-compare-panel';
import {
  renderSizeAnalytics,
  summarizeSizeDiff,
} from '../analysis-history/analysis-renderers';
import { buildSizeHtml } from './size-html';

/** Singleton panel showing database size breakdown. */
export class SizePanel {
  private static _currentPanel: SizePanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];
  private _data: ISizeAnalytics;
  private readonly _historyStore: AnalysisHistoryStore<ISizeAnalytics>;

  static createOrShow(
    data: ISizeAnalytics,
    historyStore: AnalysisHistoryStore<ISizeAnalytics>,
  ): void {
    const column = vscode.ViewColumn.Beside;

    if (SizePanel._currentPanel) {
      SizePanel._currentPanel._update(data);
      SizePanel._currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'driftSize',
      'Size Analytics',
      column,
      { enableScripts: true },
    );
    SizePanel._currentPanel = new SizePanel(panel, data, historyStore);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    data: ISizeAnalytics,
    historyStore: AnalysisHistoryStore<ISizeAnalytics>,
  ) {
    this._panel = panel;
    this._data = data;
    this._historyStore = historyStore;

    this._panel.onDidDispose(
      () => this._dispose(), null, this._disposables,
    );
    this._panel.webview.onDidReceiveMessage(
      (msg) => this._handleMessage(msg),
      null,
      this._disposables,
    );
    this._render();
  }

  private _update(data: ISizeAnalytics): void {
    this._data = data;
    this._panel.title = 'Size Analytics';
    this._render();
  }

  private _render(): void {
    this._panel.webview.html = buildSizeHtml(
      this._data,
      this._historyStore.size,
    );
  }

  private _handleMessage(msg: { command: string }): void {
    switch (msg.command) {
      case 'copyReport':
        vscode.env.clipboard.writeText(
          JSON.stringify(this._data, null, 2),
        );
        break;
      case 'saveSnapshot': {
        const entry = this._historyStore.save(this._data);
        vscode.window.showInformationMessage(
          `Saved size analytics snapshot (${entry.label}).`,
        );
        this._render();
        break;
      }
      case 'compareHistory': {
        AnalysisComparePanel.show(
          'Size Analytics',
          this._historyStore.getAll(),
          this._data,
          renderSizeAnalytics,
          summarizeSizeDiff,
        );
        break;
      }
    }
  }

  private _dispose(): void {
    SizePanel._currentPanel = undefined;
    this._panel.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}
