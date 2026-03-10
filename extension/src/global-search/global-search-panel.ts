/**
 * Singleton webview panel for cross-table global search.
 * Delegates search execution to GlobalSearchEngine and
 * renders results via global-search-html.
 */

import * as vscode from 'vscode';
import { DriftApiClient } from '../api-client';
import { GlobalSearchEngine } from './global-search-engine';
import { buildGlobalSearchHtml } from './global-search-html';
import type { ISearchResult, SearchMode, SearchScope } from './global-search-types';

interface ISearchMessage {
  command: 'search';
  query: string;
  mode: SearchMode;
  scope: SearchScope;
}

interface ICopyMessage {
  command: 'copyValue';
  value: string;
}

type PanelMessage = ISearchMessage | ICopyMessage;

/** Singleton webview panel for searching across all database tables. */
export class GlobalSearchPanel {
  private static _currentPanel: GlobalSearchPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _engine: GlobalSearchEngine;
  private _lastResult: ISearchResult | undefined;

  static createOrShow(client: DriftApiClient): void {
    const column = vscode.ViewColumn.Active;

    if (GlobalSearchPanel._currentPanel) {
      GlobalSearchPanel._currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'driftGlobalSearch',
      'Search All Tables',
      column,
      { enableScripts: true },
    );
    GlobalSearchPanel._currentPanel = new GlobalSearchPanel(panel, client);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    client: DriftApiClient,
  ) {
    this._panel = panel;
    this._engine = new GlobalSearchEngine(client);

    this._panel.onDidDispose(
      () => this._dispose(), null, this._disposables,
    );

    this._panel.webview.onDidReceiveMessage(
      (msg: PanelMessage) => this._handleMessage(msg),
      null,
      this._disposables,
    );

    this._render();
  }

  private _render(): void {
    this._panel.webview.html = buildGlobalSearchHtml(this._lastResult);
  }

  private async _handleMessage(msg: PanelMessage): Promise<void> {
    switch (msg.command) {
      case 'search':
        await this._doSearch(msg.query, msg.mode, msg.scope);
        break;
      case 'copyValue':
        await vscode.env.clipboard.writeText(msg.value);
        break;
    }
  }

  private async _doSearch(
    query: string, mode: SearchMode, scope: SearchScope,
  ): Promise<void> {
    this._panel.webview.html = buildGlobalSearchHtml(undefined, true);

    try {
      this._lastResult = await this._engine.search(query, mode, scope);
      this._panel.webview.html = buildGlobalSearchHtml(this._lastResult);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._lastResult = undefined;
      this._panel.webview.html = buildGlobalSearchHtml();
      vscode.window.showErrorMessage(`Search failed: ${message}`);
    }
  }

  private _dispose(): void {
    GlobalSearchPanel._currentPanel = undefined;
    this._panel.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}
