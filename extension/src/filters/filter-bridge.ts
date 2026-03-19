import type * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import { q } from '../shared-utils';
import type { FilterStore } from './filter-store';
import { FILTER_BRIDGE_SCRIPT } from './filter-bridge-script';
import type { FilterMessage, ISavedFilter } from './filter-types';

function isFilterMessage(msg: unknown): msg is FilterMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const cmd = (msg as Record<string, unknown>).command;
  return (
    cmd === 'getFilters' || cmd === 'saveFilter' ||
    cmd === 'applyFilter' || cmd === 'deleteFilter' ||
    cmd === 'clearFilter'
  );
}

/** Build a filtered SELECT query from a saved filter. */
export function buildFilterQuery(filter: ISavedFilter): string {
  const cols = filter.columns?.length
    ? filter.columns.map(q).join(', ')
    : '*';
  let sql = `SELECT ${cols} FROM ${q(filter.table)}`;
  if (filter.where) sql += ` WHERE ${filter.where}`;
  if (filter.orderBy) sql += ` ORDER BY ${filter.orderBy}`;
  return sql;
}

/**
 * Bridge between the webview (injected filter JS) and the FilterStore / API.
 * Follows the same pattern as EditingBridge and FkNavigator.
 */
export class FilterBridge implements vscode.Disposable {
  private _webview: vscode.Webview | undefined;

  constructor(
    private readonly _store: FilterStore,
    private readonly _client: DriftApiClient,
  ) {}

  /** Attach to a webview panel to receive messages and push state. */
  attach(webview: vscode.Webview): void {
    this._webview = webview;
  }

  detach(): void {
    this._webview = undefined;
  }

  /** Handle a message from the webview. Returns true if handled. */
  handleMessage(msg: unknown): boolean {
    if (!isFilterMessage(msg)) return false;

    switch (msg.command) {
      case 'getFilters':
        this._handleGetFilters(msg.table);
        break;
      case 'saveFilter':
        this._handleSaveFilter(msg.filter);
        break;
      case 'applyFilter':
        void this._handleApplyFilter(msg.filterId);
        break;
      case 'deleteFilter':
        this._handleDeleteFilter(msg.filterId);
        break;
      case 'clearFilter':
        this._handleClearFilter();
        break;
    }
    return true;
  }

  /** Returns inline JS to inject into the webview HTML for filter management. */
  static injectedScript(): string {
    return FILTER_BRIDGE_SCRIPT;
  }

  dispose(): void {
    this._webview = undefined;
  }

  /**
   * Programmatically apply an ad-hoc WHERE clause to the currently
   * attached Data Viewer webview.
   *
   * This powers features like "Mutation Stream → View Row" without
   * creating a persisted saved filter.
   */
  async applyWhereFilter(args: {
    table: string;
    name: string;
    where: string;
  }): Promise<void> {
    if (!this._webview) return;

    const filter: ISavedFilter = {
      id: `ad-hoc-${Date.now()}`,
      name: args.name,
      table: args.table,
      where: args.where,
      createdAt: 0,
      updatedAt: 0,
    };

    try {
      const sql = `SELECT * FROM ${q(args.table)} WHERE ${args.where}`;
      const result = await this._client.sql(sql);
      this._post({
        command: 'filterApplied',
        filter,
        rows: result.rows,
        columns: result.columns,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this._post({ command: 'filterError', error: message });
    }
  }

  // --- Private handlers ---

  private _handleGetFilters(table: string): void {
    const filters = this._store.forTable(table);
    this._post({ command: 'filters', table, filters });
  }

  private _handleSaveFilter(filter: ISavedFilter): void {
    this._store.save(filter);
    const filters = this._store.forTable(filter.table);
    this._post({ command: 'filters', table: filter.table, filters });
  }

  private async _handleApplyFilter(filterId: string): Promise<void> {
    const filter = this._store.getById(filterId);
    if (!filter) return;
    try {
      const sql = buildFilterQuery(filter);
      const result = await this._client.sql(sql);
      this._post({
        command: 'filterApplied',
        filter,
        rows: result.rows,
        columns: result.columns,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this._post({ command: 'filterError', error: message });
    }
  }

  private _handleDeleteFilter(filterId: string): void {
    const filter = this._store.getById(filterId);
    if (!filter) return;
    const table = filter.table;
    this._store.remove(filterId);
    const filters = this._store.forTable(table);
    this._post({ command: 'filters', table, filters });
  }

  private _handleClearFilter(): void {
    this._post({ command: 'filterCleared' });
  }

  private _post(msg: Record<string, unknown>): void {
    if (!this._webview) return;
    void this._webview.postMessage(msg);
  }
}
