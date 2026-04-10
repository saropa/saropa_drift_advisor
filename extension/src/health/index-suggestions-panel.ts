/**
 * Singleton webview panel for Index Suggestions.
 * Replaces the old showQuickPick-based display with a full rich table.
 * Supports saving snapshots and comparing analysis history.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { IndexSuggestion } from '../api-types';
import type { AnalysisHistoryStore } from '../analysis-history/analysis-history-store';
import { AnalysisComparePanel } from '../analysis-history/analysis-compare-panel';
import {
  renderIndexSuggestions,
  summarizeIndexDiff,
} from '../analysis-history/analysis-renderers';
import { buildIndexSuggestionsHtml } from './index-suggestions-html';

/** Singleton panel showing index suggestions in a rich table. */
export class IndexSuggestionsPanel {
  private static _currentPanel: IndexSuggestionsPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];
  private _suggestions: IndexSuggestion[];
  private readonly _client: DriftApiClient;
  private readonly _historyStore: AnalysisHistoryStore<IndexSuggestion[]>;

  static createOrShow(
    suggestions: IndexSuggestion[],
    client: DriftApiClient,
    historyStore: AnalysisHistoryStore<IndexSuggestion[]>,
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
      new IndexSuggestionsPanel(panel, suggestions, client, historyStore);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    suggestions: IndexSuggestion[],
    client: DriftApiClient,
    historyStore: AnalysisHistoryStore<IndexSuggestion[]>,
  ) {
    this._panel = panel;
    this._suggestions = suggestions;
    this._client = client;
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

  private _update(suggestions: IndexSuggestion[]): void {
    this._suggestions = suggestions;
    this._render();
  }

  private _render(): void {
    this._panel.webview.html = buildIndexSuggestionsHtml(
      this._suggestions,
      this._historyStore.size,
    );
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
      case 'exportAnalysis': {
        await this._exportAnalysis();
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
      case 'saveSnapshot': {
        const entry = this._historyStore.save(this._suggestions);
        vscode.window.showInformationMessage(
          `Saved index suggestions snapshot (${entry.label}).`,
        );
        // Re-render to update the history count badge
        this._render();
        break;
      }
      case 'compareHistory': {
        AnalysisComparePanel.show(
          'Index Suggestions',
          this._historyStore.getAll(),
          this._suggestions,
          renderIndexSuggestions,
          summarizeIndexDiff,
        );
        break;
      }
    }
  }

  /** Export the full analysis as JSON, CSV, or Markdown via quick-pick. */
  private async _exportAnalysis(): Promise<void> {
    const format = await vscode.window.showQuickPick(
      ['JSON', 'CSV', 'Markdown'],
      { placeHolder: 'Export format for index suggestions' },
    );
    if (!format) {
      return;
    }

    let text: string;
    if (format === 'JSON') {
      text = JSON.stringify(this._suggestions, null, 2);
    } else if (format === 'CSV') {
      // CSV header + rows
      const header = 'table,column,priority,reason,sql';
      const rows = this._suggestions.map((s) => {
        const csvEsc = (v: string) => {
          if (v.includes(',') || v.includes('"') || v.includes('\n')) {
            return '"' + v.replace(/"/g, '""') + '"';
          }
          return v;
        };
        return [s.table, s.column, s.priority, s.reason, s.sql]
          .map(csvEsc).join(',');
      });
      text = header + '\n' + rows.join('\n');
    } else {
      // Markdown table — escape pipe characters to avoid breaking columns
      const mdEsc = (v: string) => v.replace(/\|/g, '\\|');
      const lines = [
        '| Table | Column | Priority | Reason | SQL |',
        '|-------|--------|----------|--------|-----|',
        ...this._suggestions.map((s) =>
          `| ${mdEsc(s.table)} | ${mdEsc(s.column)} | ${s.priority} | ${mdEsc(s.reason)} | \`${mdEsc(s.sql)}\` |`,
        ),
      ];
      text = lines.join('\n');
    }

    const dest = await vscode.window.showQuickPick(
      ['Copy to clipboard', 'Save to file'],
      { placeHolder: 'Where to export?' },
    );
    if (!dest) {
      return;
    }

    if (dest === 'Copy to clipboard') {
      await vscode.env.clipboard.writeText(text);
      vscode.window.showInformationMessage(
        `Copied ${this._suggestions.length} index suggestion(s) as ${format}.`,
      );
    } else {
      const extMap: Record<string, string> = { JSON: 'json', CSV: 'csv', Markdown: 'md' };
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`index-suggestions.${extMap[format]}`),
        filters: { [format]: [extMap[format]] },
      });
      if (uri) {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf-8'));
        vscode.window.showInformationMessage(`Saved index suggestions to ${uri.fsPath}`);
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
