/**
 * Singleton webview panel for Database Comparison visualization.
 * Follows the SchemaDiffPanel pattern.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { ICompareReport } from '../api-types';
import { buildCompareHtml } from './compare-html';

/** Singleton panel showing database-A-vs-B comparison. */
export class ComparePanel {
  private static _currentPanel: ComparePanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];
  private _report: ICompareReport;
  private _client: DriftApiClient | undefined;

  static createOrShow(report: ICompareReport, client?: DriftApiClient): void {
    const column = vscode.ViewColumn.Beside;

    if (ComparePanel._currentPanel) {
      ComparePanel._currentPanel._update(report);
      ComparePanel._currentPanel._client = client;
      ComparePanel._currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'driftCompare',
      'Database Comparison',
      column,
      { enableScripts: true },
    );
    ComparePanel._currentPanel = new ComparePanel(panel, report, client);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    report: ICompareReport,
    client?: DriftApiClient,
  ) {
    this._panel = panel;
    this._report = report;
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

  private _update(report: ICompareReport): void {
    this._report = report;
    this._panel.title = 'Database Comparison';
    this._render();
  }

  private _render(): void {
    this._panel.webview.html = buildCompareHtml(this._report);
  }

  private _handleMessage(msg: { command: string }): void {
    switch (msg.command) {
      case 'copyReport':
        vscode.env.clipboard.writeText(
          JSON.stringify(this._report, null, 2),
        );
        break;
      case 'copyMigrationSql':
        this._copyMigrationSql();
        break;
    }
  }

  /** Fetch migration preview from the server and copy the SQL to clipboard. */
  private async _copyMigrationSql(): Promise<void> {
    if (!this._client) {
      vscode.window.showWarningMessage(
        'No API client available — cannot generate migration SQL.',
      );
      return;
    }
    try {
      const result = await this._client.migrationPreview();
      if (!result.migrationSql || result.changeCount === 0) {
        vscode.window.showInformationMessage('No migration changes detected.');
        return;
      }
      await vscode.env.clipboard.writeText(result.migrationSql);
      vscode.window.showInformationMessage(
        `Copied migration SQL (${result.changeCount} change(s)) to clipboard.`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Migration preview failed: ${msg}`);
    }
  }

  private _dispose(): void {
    ComparePanel._currentPanel = undefined;
    this._panel.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}
