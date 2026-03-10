import * as vscode from 'vscode';
import { DriftApiClient } from '../api-client';
import { q } from '../shared-utils';
import { FK_NAVIGATION_SCRIPT } from './fk-navigator-script';
import type {
  FkMessage, IFkLink, INavigationEntry,
} from './fk-navigator-types';

function isFkMessage(msg: unknown): msg is FkMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const cmd = (msg as Record<string, unknown>).command;
  return (
    cmd === 'fkNavigate' || cmd === 'fkBack' ||
    cmd === 'fkForward' || cmd === 'fkGetColumns'
  );
}

/** Escape a SQL literal value (single-quote doubling). */
function escapeSqlValue(value: unknown): string {
  return String(value).replace(/'/g, "''");
}

/** Build a filtered SELECT query for an FK target. */
function buildFkQuery(table: string, column: string, value: unknown): string {
  return `SELECT * FROM ${q(table)} WHERE ${q(column)} = '${escapeSqlValue(value)}'`;
}

/**
 * Bridge between the webview (injected FK link JS) and the Drift API.
 * Manages FK navigation history, caches FK metadata, and injects the
 * client-side script that transforms FK cells into clickable links.
 */
export class FkNavigator implements vscode.Disposable {
  private _webview: vscode.Webview | undefined;
  private readonly _history: INavigationEntry[] = [];
  private _cursor = -1;
  private readonly _fkCache = new Map<string, IFkLink[]>();

  constructor(private readonly _client: DriftApiClient) {}

  /** Attach to a webview panel to receive messages and push state. */
  attach(webview: vscode.Webview): void {
    this._webview = webview;
  }

  detach(): void {
    this._webview = undefined;
  }

  /** Handle a message from the webview. Returns true if handled. */
  handleMessage(msg: unknown): boolean {
    if (!isFkMessage(msg)) return false;

    switch (msg.command) {
      case 'fkNavigate':
        void this._handleNavigate(msg.toTable, msg.toColumn, msg.value);
        break;
      case 'fkBack':
        void this._handleBack();
        break;
      case 'fkForward':
        void this._handleForward();
        break;
      case 'fkGetColumns':
        void this._handleGetColumns(msg.table);
        break;
    }
    return true;
  }

  get canGoBack(): boolean { return this._cursor > 0; }

  get canGoForward(): boolean {
    return this._cursor < this._history.length - 1;
  }

  get breadcrumbs(): INavigationEntry[] {
    return this._history.slice(0, this._cursor + 1);
  }

  /** Returns inline JS to inject into the webview HTML for FK links. */
  static injectedScript(): string {
    return FK_NAVIGATION_SCRIPT;
  }

  dispose(): void {
    this._webview = undefined;
    this._history.length = 0;
    this._cursor = -1;
    this._fkCache.clear();
  }

  private async _handleNavigate(
    toTable: string, toColumn: string, value: unknown,
  ): Promise<void> {
    try {
      const result = await this._client.sql(
        buildFkQuery(toTable, toColumn, value),
      );
      this._pushEntry({ table: toTable, filter: { column: toColumn, value } });
      this._postToWebview({
        command: 'fkNavigated',
        table: toTable,
        filter: { column: toColumn, value },
        rows: result.rows,
        columns: result.columns,
      });
      this._sendBreadcrumbs();
    } catch {
      // Query failure — don't navigate
    }
  }

  private async _handleBack(): Promise<void> {
    if (!this.canGoBack) return;
    this._cursor--;
    await this._replayEntry(this._history[this._cursor]);
  }

  private async _handleForward(): Promise<void> {
    if (!this.canGoForward) return;
    this._cursor++;
    await this._replayEntry(this._history[this._cursor]);
  }

  private async _handleGetColumns(table: string): Promise<void> {
    const enabled = vscode.workspace
      .getConfiguration('driftViewer')
      .get<boolean>('fkHyperlinks.enabled', true);
    if (!enabled) {
      this._postToWebview({ command: 'fkColumns', table, fkColumns: [] });
      return;
    }

    let links = this._fkCache.get(table);
    if (!links) {
      try {
        const fks = await this._client.tableFkMeta(table);
        links = fks.map((fk) => ({
          fromTable: table,
          fromColumn: fk.fromColumn,
          toTable: fk.toTable,
          toColumn: fk.toColumn,
        }));
      } catch {
        links = [];
      }
      this._fkCache.set(table, links);
    }
    this._postToWebview({ command: 'fkColumns', table, fkColumns: links });
  }

  private async _replayEntry(entry: INavigationEntry): Promise<void> {
    if (!entry.filter) {
      this._sendBreadcrumbs();
      return;
    }
    try {
      const result = await this._client.sql(
        buildFkQuery(entry.table, entry.filter.column, entry.filter.value),
      );
      this._postToWebview({
        command: 'fkNavigated',
        table: entry.table,
        filter: entry.filter,
        rows: result.rows,
        columns: result.columns,
      });
    } catch {
      // Replay failure — just update breadcrumbs
    }
    this._sendBreadcrumbs();
  }

  private _pushEntry(entry: INavigationEntry): void {
    this._history.splice(this._cursor + 1);
    this._history.push(entry);
    this._cursor = this._history.length - 1;
  }

  private _sendBreadcrumbs(): void {
    this._postToWebview({
      command: 'fkBreadcrumbs',
      entries: this.breadcrumbs,
      canBack: this.canGoBack,
      canForward: this.canGoForward,
    });
  }

  private _postToWebview(msg: Record<string, unknown>): void {
    if (!this._webview) return;
    void this._webview.postMessage(msg);
  }
}
