/**
 * Mutation stream panel UI: displays semantic INSERT/UPDATE/DELETE events
 * with filtering and navigation to the affected row.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { MutationEvent } from '../api-types';
import type { EditingBridge } from '../editing/editing-bridge';
import type { FilterBridge } from '../filters/filter-bridge';
import { sqlLiteral } from '../lineage/lineage-tracer';
import type { FkNavigator } from '../navigation/fk-navigator';
import { DriftViewerPanel } from '../panel';
import { buildMutationStreamHtml, buildMutationStreamLoadingHtml } from './mutation-stream-html';
import { matchesColumnValue, matchesSearch } from './mutation-stream-filtering';
import type { MutationStreamFilters, MutationStreamWebviewMessage } from './mutation-stream-types';

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
      this._panel.webview.html = `
        <html><body style="padding:14px;font-family:var(--vscode-font-family,sans-serif);color:var(--vscode-editor-foreground,#ccc);background:var(--vscode-editor-background,#1e1e1e);">
          <h3 style="margin-top:0;">Mutation Stream unavailable</h3>
          <p style="opacity:0.8;">
            This feature requires the HTTP Drift debug server because mutation events are captured via the <code>writeQuery</code> wrapper.
          </p>
        </body></html>`;
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
    const tables = this._tables.length
      ? this._tables
      : Array.from(new Set(this._events.map((e) => e.table)));
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
        void this._viewRow(msg.eventId);
        break;
      case 'ready':
        // Webview handshake; render already reflects state.
        break;
    }
  }

  private async _viewRow(eventId: number): Promise<void> {
    const event = this._events.find((e) => e.id === eventId);
    if (!event) return;

    const row = event.after?.[0] ?? event.before?.[0] ?? undefined;

    if (!row) {
      vscode.window.showWarningMessage(
        `No row snapshot available for event ${eventId}.`,
      );
      return;
    }

    const pkColumn = this._pkColumns.get(event.table) ?? 'rowid';
    const pkValue = row[pkColumn];
    if (pkValue === undefined) {
      vscode.window.showWarningMessage(
        `Could not find primary key value for ${event.table}.${pkColumn}.`,
      );
      return;
    }

    DriftViewerPanel.createOrShow(
      this._client.host,
      this._client.port,
      this._editingBridge,
      this._fkNavigator,
      this._filterBridge,
    );

    // Wait a moment for the DriftViewerPanel to load and inject filter scripts.
    setTimeout(() => {
      const where = `"${pkColumn}" = ${sqlLiteral(pkValue)}`;
      void this._filterBridge.applyWhereFilter({
        table: event.table,
        name: `Mutation ${event.type.toUpperCase()} #${event.id}`,
        where,
      });
    }, 600);
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
      vscode.window.showWarningMessage(
        `Mutation stream poll failed: ${msg}`,
      );
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
    MutationStreamPanel._currentPanel = undefined;
    this._polling = false;
    this._events = [];
    for (const d of this._disposables) d.dispose();
    this._disposables.length = 0;
  }
}

