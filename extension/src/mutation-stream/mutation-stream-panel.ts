/**
 * Mutation stream panel UI: displays semantic INSERT/UPDATE/DELETE events
 * with filtering and navigation to the affected row.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { MutationEvent } from '../api-types';
import type { EditingBridge } from '../editing/editing-bridge';
import type { FilterBridge } from '../filters/filter-bridge';
import type { FkNavigator } from '../navigation/fk-navigator';
import { buildMutationStreamHtml, buildMutationStreamLoadingHtml } from './mutation-stream-html';
import { matchesColumnValue, matchesSearch } from './mutation-stream-filtering';
import {
  buildVmServiceUnavailableHtml,
  resolveMutationFilterTables,
} from './mutation-stream-panel-helpers';
import type { MutationStreamFilters, MutationStreamWebviewMessage } from './mutation-stream-types';
import { viewMutationEventRow } from './mutation-stream-view-row';

export class MutationStreamPanel {
  private static _currentPanel: MutationStreamPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];

  private _events: MutationEvent[] = [];
  private _since = 0;
  private _paused = false;
  private _filters: MutationStreamFilters = {
    table: '',
    type: 'all',
    mode: 'freeText',
    search: '',
    column: '',
    columnValue: '',
  };
  private _tables: string[] = [];
  private _columnsByTable: Map<string, string[]> = new Map();
  private _pkColumns: Map<string, string> = new Map();

  private _polling = false;
  private _pollToken = 0;
  private _initStarted = false;
  private _initPromise: Promise<void> | undefined;
  private _didWarnPollFailure = false;
  private _disposed = false;

  constructor(
    panel: vscode.WebviewPanel,
    private readonly _client: DriftApiClient,
    private readonly _editingBridge: EditingBridge,
    private readonly _fkNavigator: FkNavigator,
    private readonly _filterBridge: FilterBridge,
  ) {
    this._panel = panel;

    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      (msg) => this._handleMessage(msg as MutationStreamWebviewMessage),
      null,
      this._disposables,
    );
  }

  static createOrShow(
    host: string,
    port: number,
    client: DriftApiClient,
    editingBridge: EditingBridge,
    fkNavigator: FkNavigator,
    filterBridge: FilterBridge,
  ): void {
    const column = vscode.ViewColumn.Beside;
    if (MutationStreamPanel._currentPanel) {
      MutationStreamPanel._currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'driftMutationStream',
      'Mutation Stream',
      column,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    MutationStreamPanel._currentPanel = new MutationStreamPanel(
      panel,
      client,
      editingBridge,
      fkNavigator,
      filterBridge,
    );
    MutationStreamPanel._currentPanel._init(host, port).catch(() => {
      MutationStreamPanel._currentPanel?._render();
    });
  }

  private async _init(_host: string, _port: number): Promise<void> {
    if (this._initStarted) return;
    this._initStarted = true;

    this._panel.webview.html = buildMutationStreamLoadingHtml({
      message: 'Loading schema for column filters…',
    });

    if (this._client.usingVmService) {
      this._panel.webview.html = buildVmServiceUnavailableHtml();
      return;
    }

    this._initPromise = this._client
      .schemaMetadata()
      .then((tables) => {
        this._tables = tables.map((t) => t.name);
        this._columnsByTable = new Map();
        for (const t of tables) {
          const pk = t.columns.find((c) => c.pk)?.name ?? 'rowid';
          this._pkColumns.set(t.name, pk);
          const cols = t.columns.map((c) => c.name);
          this._columnsByTable.set(t.name, cols);
        }
      })
      .catch(() => {
        this._tables = [];
        this._columnsByTable = new Map();
        this._pkColumns = new Map();
      });

    await this._initPromise;
    this._render();
    this._startPolling();
  }

  private _filteredEvents(): readonly MutationEvent[] {
    const f = this._normalizeFilters(this._filters);
    return this._events.filter((e) => {
      if (f.table && e.table !== f.table) return false;
      if (f.type !== 'all' && e.type !== f.type) return false;
      if (f.mode === 'freeText') return matchesSearch(e, f.search);
      return matchesColumnValue(e, f.column, f.columnValue);
    });
  }

  private _normalizeFilters(filters: MutationStreamFilters): MutationStreamFilters {
    if (filters.mode !== 'columnValue') return filters;
    const available = this._availableColumns(filters.table);
    if (available.length === 0) {
      return { ...filters, column: '' };
    }
    if (!filters.column || !available.includes(filters.column)) {
      return { ...filters, column: available[0] };
    }
    return filters;
  }

  private _availableColumns(table: string): string[] {
    if (table) return this._columnsByTable.get(table) ?? [];
    // "All tables": union columns across schema so the dropdown still works.
    const set = new Set<string>();
    for (const cols of this._columnsByTable.values()) {
      for (const c of cols) set.add(c);
    }
    return Array.from(set.values());
  }

  private _render(): void {
    const filtered = this._filteredEvents();
    const f = this._normalizeFilters(this._filters);
    const tables = resolveMutationFilterTables(this._tables, this._events);
    const columns = this._availableColumns(f.table);

    this._panel.webview.html = buildMutationStreamHtml({
      events: filtered,
      filters: f,
      paused: this._paused,
      tables,
      columns,
    });
  }

  private async _handleMessage(
    msg: MutationStreamWebviewMessage,
  ): Promise<void> {
    switch (msg.command) {
      case 'filters':
        // Defensive merge: keeps backward compatibility with older
        // webviews that might not send every filter field.
        this._filters = { ...this._filters, ...msg.filters };
        this._render();
        break;
      case 'togglePause':
        this._paused = msg.paused;
        this._render();
        break;
      case 'exportJson':
        await vscode.env.clipboard.writeText(
          JSON.stringify(
            { cursor: this._since, events: this._events },
            null,
            2,
          ),
        );
        vscode.window.showInformationMessage(
          'Mutation stream copied to clipboard.',
        );
        break;
      case 'viewRow':
        void viewMutationEventRow({
          eventId: msg.eventId,
          events: this._events,
          pkColumns: this._pkColumns,
          client: this._client,
          editingBridge: this._editingBridge,
          fkNavigator: this._fkNavigator,
          filterBridge: this._filterBridge,
          isDisposed: () => this._disposed,
        });
        break;
      case 'ready':
        // Webview handshake; render already reflects state.
        break;
    }
  }

  private _startPolling(): void {
    if (this._polling) return;
    this._polling = true;
    const token = ++this._pollToken;

    void (async () => {
      while (this._polling && token === this._pollToken) {
        if (await this._pollPausedIteration()) continue;
        await this._pollOnceIteration(token);
      }
    })();
  }

  /** If currently paused, delay briefly and indicate the loop should continue. */
  private async _pollPausedIteration(): Promise<boolean> {
    if (!this._paused) return false;
    await new Promise((r) => setTimeout(r, 250));
    return true;
  }

  /** Perform a single poll cycle and handle success/error paths. */
  private async _pollOnceIteration(token: number): Promise<void> {
    try {
      const resp = await this._client.mutations(this._since);
      if (!this._polling || token !== this._pollToken) return;

      if (resp.events.length > 0) {
        this._since = resp.cursor;
        this._events.push(...resp.events);
        this._events = this._events.slice(-MutationStreamPanel._maxBufferSize());
        this._render();
      }
    } catch (err: unknown) {
      await this._handlePollError(err);
    }
  }

  /** Display (once) the poll error and optionally stop polling. */
  private async _handlePollError(err: unknown): Promise<void> {
    const msg = err instanceof Error ? err.message : 'Unknown error';

    // Avoid spamming VS Code toasts every poll interval.
    if (!this._didWarnPollFailure) {
      void vscode.window
        .showWarningMessage(
          `Mutation stream poll failed: ${msg}`,
          'Retry Discovery',
        )
        .then((choice) => {
          if (choice === 'Retry Discovery') {
            void vscode.commands.executeCommand('driftViewer.retryDiscovery');
          }
        });
      this._didWarnPollFailure = true;
    }

    // If the server doesn't support mutations, stop polling entirely.
    if (msg.includes('501')) {
      this._polling = false;
      return;
    }

    await new Promise((r) => setTimeout(r, 2000));
  }

  private static _maxBufferSize(): number {
    // Keep UI bounded even if server ring buffer changes.
    return 500;
  }

  private _dispose(): void {
    this._disposed = true;
    MutationStreamPanel._currentPanel = undefined;
    this._polling = false;
    this._events = [];
    for (const d of this._disposables) d.dispose();
    this._disposables.length = 0;
  }
}

