import * as vscode from 'vscode';
import type { IImpactResult } from './impact-types';
import { ImpactAnalyzer, generateImpactDeleteSql } from './impact-analyzer';
import { buildImpactHtml } from './impact-html';

/** Singleton webview panel for row impact analysis. */
export class ImpactPanel {
  private static _currentPanel: ImpactPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _analyzer: ImpactAnalyzer;
  private _result: IImpactResult;

  static createOrShow(
    analyzer: ImpactAnalyzer, result: IImpactResult,
  ): void {
    const column = vscode.ViewColumn.Beside;

    if (ImpactPanel._currentPanel) {
      ImpactPanel._currentPanel._update(result);
      ImpactPanel._currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'driftImpact',
      'Row Impact',
      column,
      { enableScripts: true },
    );
    ImpactPanel._currentPanel = new ImpactPanel(
      panel, analyzer, result,
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    analyzer: ImpactAnalyzer,
    result: IImpactResult,
  ) {
    this._panel = panel;
    this._analyzer = analyzer;
    this._result = result;

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

  private _update(result: IImpactResult): void {
    this._result = result;
    const r = result.root;
    this._panel.title = `Impact: ${r.table}.${r.pkColumn}=${r.pkValue}`;
    this._render();
  }

  private _render(): void {
    this._panel.webview.html = buildImpactHtml(this._result);
  }

  private async _handleMessage(
    msg: Record<string, unknown>,
  ): Promise<void> {
    switch (msg['command']) {
      case 'refresh':
        await this._reanalyze(
          this._result.root.table,
          this._result.root.pkColumn,
          this._result.root.pkValue,
        );
        break;
      case 'navigate':
        await this._reanalyze(
          String(msg['table']),
          String(msg['pkColumn']),
          msg['pkValue'],
        );
        break;
      case 'generateDelete': {
        const sql = generateImpactDeleteSql(this._result);
        this._panel.webview.postMessage({ command: 'deleteSql', sql });
        break;
      }
      case 'exportJson':
        await vscode.env.clipboard.writeText(
          JSON.stringify(this._result, null, 2),
        );
        vscode.window.showInformationMessage('Impact analysis JSON copied.');
        break;
    }
  }

  private async _reanalyze(
    table: string, pkColumn: string, pkValue: unknown,
  ): Promise<void> {
    this._panel.webview.postMessage({ command: 'loading' });
    try {
      const config = vscode.workspace.getConfiguration('driftViewer.impact');
      const depth = config.get<number>('maxDepth', 3) ?? 3;
      const result = await this._analyzer.analyze(
        table, pkColumn, pkValue, depth,
      );
      this._update(result);
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : String(err);
      this._panel.webview.postMessage({
        command: 'error', message: text,
      });
    }
  }

  private _dispose(): void {
    ImpactPanel._currentPanel = undefined;
    this._panel.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}
