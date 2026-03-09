import * as vscode from 'vscode';
import { DriftApiClient } from '../api-client';
import { getNotebookHtml } from './sql-notebook-html';

/** Persisted query history entry. */
export interface IQueryHistoryEntry {
  sql: string;
  timestamp: number;
  rowCount: number;
  durationMs: number;
  error?: string;
}

const HISTORY_KEY = 'driftViewer.sqlNotebookHistory';
const MAX_HISTORY = 50;

/**
 * Singleton webview panel providing an interactive SQL query notebook
 * with schema-aware autocomplete, sortable results, explain
 * visualisation, charts, and persistent query history.
 */
export class SqlNotebookPanel {
  public static currentPanel: SqlNotebookPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _client: DriftApiClient;
  private readonly _globalState: vscode.Memento;
  private _disposed = false;
  private _disposables: vscode.Disposable[] = [];

  static createOrShow(
    context: vscode.ExtensionContext,
    client: DriftApiClient,
  ): void {
    if (SqlNotebookPanel.currentPanel) {
      SqlNotebookPanel.currentPanel._panel.reveal(vscode.ViewColumn.Active);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'driftSqlNotebook',
      'SQL Notebook',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    SqlNotebookPanel.currentPanel = new SqlNotebookPanel(
      panel,
      context,
      client,
    );
    context.subscriptions.push(SqlNotebookPanel.currentPanel);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    client: DriftApiClient,
  ) {
    this._panel = panel;
    this._client = client;
    this._globalState = context.globalState;

    this._panel.onDidDispose(
      () => this.dispose(),
      null,
      this._disposables,
    );

    this._panel.webview.onDidReceiveMessage(
      (msg) => this._handleMessage(msg),
      null,
      this._disposables,
    );

    this._panel.webview.html = getNotebookHtml();

    // Send schema on first load (async, fire-and-forget).
    void this._sendSchema();
    this._sendHistory();
  }

  private async _handleMessage(msg: {
    command: string;
    sql?: string;
    tabId?: string;
    text?: string;
    history?: IQueryHistoryEntry[];
  }): Promise<void> {
    switch (msg.command) {
      case 'execute':
        await this._executeQuery(msg.sql!, msg.tabId!);
        break;
      case 'explain':
        await this._explainQuery(msg.sql!, msg.tabId!);
        break;
      case 'getSchema':
        await this._sendSchema();
        break;
      case 'copyToClipboard':
        await vscode.env.clipboard.writeText(msg.text!);
        break;
      case 'saveHistory':
        await this._saveHistory(msg.history!);
        break;
      case 'loadHistory':
        this._sendHistory();
        break;
    }
  }

  private async _executeQuery(
    sql: string,
    tabId: string,
  ): Promise<void> {
    const start = Date.now();
    try {
      const result = await this._client.sql(sql);
      this._post({
        command: 'queryResult',
        tabId,
        columns: result.columns,
        rows: result.rows,
        elapsed: Date.now() - start,
      });
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      this._post({ command: 'queryError', tabId, error });
    }
  }

  private async _explainQuery(
    sql: string,
    tabId: string,
  ): Promise<void> {
    try {
      const result = await this._client.explainSql(sql);
      this._post({
        command: 'explainResult',
        tabId,
        rows: result.rows,
        sql: result.sql,
      });
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      this._post({ command: 'queryError', tabId, error });
    }
  }

  private async _sendSchema(): Promise<void> {
    try {
      const tables = await this._client.schemaMetadata();
      this._post({ command: 'schema', tables });
    } catch {
      // Server not reachable — webview handles missing schema gracefully.
    }
  }

  private _sendHistory(): void {
    const entries = this._globalState.get<IQueryHistoryEntry[]>(
      HISTORY_KEY,
      [],
    );
    this._post({ command: 'history', entries });
  }

  private async _saveHistory(
    entries: IQueryHistoryEntry[],
  ): Promise<void> {
    const trimmed = entries.slice(0, MAX_HISTORY);
    await this._globalState.update(HISTORY_KEY, trimmed);
  }

  private _post(msg: unknown): void {
    if (!this._disposed) {
      this._panel.webview.postMessage(msg);
    }
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    SqlNotebookPanel.currentPanel = undefined;
    this._panel.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables.length = 0;
  }
}
