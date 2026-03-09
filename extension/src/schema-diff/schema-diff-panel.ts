/**
 * Singleton webview panel for Schema Diff visualization.
 * Follows the ExplainPanel pattern: receives precomputed data, renders HTML.
 */

import * as vscode from 'vscode';
import { ISchemaDiffResult } from './schema-diff';
import { buildSchemaDiffHtml } from './schema-diff-html';

/** Singleton panel showing code-vs-runtime schema diff. */
export class SchemaDiffPanel {
  private static _currentPanel: SchemaDiffPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];
  private _diff: ISchemaDiffResult;
  private _migrationSql: string;

  static createOrShow(
    diff: ISchemaDiffResult,
    migrationSql: string,
  ): void {
    const column = vscode.ViewColumn.Beside;

    if (SchemaDiffPanel._currentPanel) {
      SchemaDiffPanel._currentPanel._update(diff, migrationSql);
      SchemaDiffPanel._currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'driftSchemaDiff',
      'Schema Diff',
      column,
      { enableScripts: true },
    );
    SchemaDiffPanel._currentPanel = new SchemaDiffPanel(
      panel, diff, migrationSql,
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    diff: ISchemaDiffResult,
    migrationSql: string,
  ) {
    this._panel = panel;
    this._diff = diff;
    this._migrationSql = migrationSql;

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

  private _update(
    diff: ISchemaDiffResult,
    migrationSql: string,
  ): void {
    this._diff = diff;
    this._migrationSql = migrationSql;
    this._panel.title = 'Schema Diff';
    this._render();
  }

  private _render(): void {
    this._panel.webview.html = buildSchemaDiffHtml(
      this._diff, this._migrationSql,
    );
  }

  private _handleMessage(
    msg: { command: string; fileUri?: string; line?: number },
  ): void {
    switch (msg.command) {
      case 'copyMigrationSql':
        vscode.env.clipboard.writeText(this._migrationSql);
        break;
      case 'navigate':
        if (msg.fileUri && msg.line !== undefined) {
          const uri = vscode.Uri.parse(msg.fileUri);
          const pos = new vscode.Position(msg.line, 0);
          const sel = new vscode.Range(pos, pos);
          vscode.window.showTextDocument(uri, { selection: sel });
        }
        break;
    }
  }

  private _dispose(): void {
    SchemaDiffPanel._currentPanel = undefined;
    this._panel.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}
