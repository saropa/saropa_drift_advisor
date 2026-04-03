/**
 * Singleton webview panel for Index Suggestions.
 * Replaces the old showQuickPick-based display with a full rich table.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { IndexSuggestion } from '../api-types';
import { buildIndexSuggestionsHtml } from './index-suggestions-html';

/** Singleton panel showing index suggestions in a rich table. */
export class IndexSuggestionsPanel {
  private static _currentPanel: IndexSuggestionsPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];
  private _suggestions: IndexSuggestion[];
  private readonly _client: DriftApiClient;

  static createOrShow(
    suggestions: IndexSuggestion[],
    client: DriftApiClient,
  ): void {
    const column = vscode.ViewColumn.Active;

    if (IndexSuggestionsPanel._currentPanel) {
      IndexSuggestionsPanel._currentPanel._update(suggestions);
      IndexSuggestionsPanel._currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'driftIndexSuggestions',
      'Index Suggestions',
      column,
      { enableScripts: true },
    );
    IndexSuggestionsPanel._currentPanel =
      new IndexSuggestionsPanel(panel, suggestions, client);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    suggestions: IndexSuggestion[],
    client: DriftApiClient,
  ) {
    this._panel = panel;
    this._suggestions = suggestions;
    this._client = client;

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

  private _update(suggestions: IndexSuggestion[]): void {
    this._suggestions = suggestions;
    this._render();
  }

  private _render(): void {
    this._panel.webview.html = buildIndexSuggestionsHtml(this._suggestions);
  }

  private async _handleMessage(
    msg: { command: string; index?: number; indexes?: number[] },
  ): Promise<void> {
    switch (msg.command) {
      case 'copySingle': {
        if (msg.index !== undefined && this._suggestions[msg.index]) {
          await vscode.env.clipboard.writeText(this._suggestions[msg.index].sql);
          vscode.window.showInformationMessage('Copied CREATE INDEX SQL to clipboard.');
        }
        break;
      }
      case 'copySelected': {
        const indexes = msg.indexes ?? [];
        const sql = indexes
          .filter((i) => this._suggestions[i])
          .map((i) => this._suggestions[i].sql)
          .join('\n');
        if (sql) {
          await vscode.env.clipboard.writeText(sql);
          vscode.window.showInformationMessage(
            `Copied ${indexes.length} CREATE INDEX statement(s) to clipboard.`,
          );
        }
        break;
      }
      case 'copyAll': {
        const allSql = this._suggestions.map((s) => s.sql).join('\n');
        await vscode.env.clipboard.writeText(allSql);
        vscode.window.showInformationMessage(
          `Copied ${this._suggestions.length} CREATE INDEX statement(s) to clipboard.`,
        );
        break;
      }
      case 'createAll': {
        // Delegate to the existing createAllIndexes command
        vscode.commands.executeCommand(
          'driftViewer.createAllIndexes',
          { indexes: this._suggestions },
        );
        break;
      }
    }
  }

  private _dispose(): void {
    IndexSuggestionsPanel._currentPanel = undefined;
    this._panel.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}
