/**
 * Database Explorer tree: tables, columns, and a fallback row list when the
 * extension reports a Drift connection but REST schema load failed. That fallback uses
 * [TreeItem.command] (reliable across hosts) instead of relying on `viewsWelcome` markdown
 * `command:` links, which may not execute in some VS Code forks.
 *
 * Tool/feature commands (Schema Diff, Health Score, etc.) live exclusively in
 * the "Drift Tools" panel ([ToolsTreeProvider]) — not duplicated here.
 */
import * as vscode from 'vscode';
import { DriftApiClient, TableMetadata } from '../api-client';
import type { AnnotationStore } from '../annotations/annotation-store';
import type { PinStore } from './pin-store';
import type { TableGroupingStore } from './table-grouping-store';
import { TableItem } from './tree-items';
import { type TreeNode, resolveChildren } from './drift-tree-children';
import { isMonitoringKilled } from '../monitoring/monitoring-state';
import { createTreeRefreshOrchestrator, type TreeRefreshOrchestrator } from './drift-tree-refresh';

/** Minimal log sink — matches vscode.OutputChannel.appendLine signature. */
interface LogSink {
  appendLine(msg: string): void;
}

export class DriftTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly _client: DriftApiClient;
  private readonly _annotationStore?: AnnotationStore;
  /**
   * When true, the extension reports a Drift UI connection (HTTP and/or VM Service) while
   * this tree has no live schema — used to hide the broken welcome overlay and show real
   * [TreeItem] commands instead.
   */
  private readonly _isDriftUiConnected: () => boolean;
  private _tables: TableMetadata[] = [];
  private _tableItems: TableItem[] = [];
  private _pinStore?: PinStore;
  private _groupingStore?: TableGroupingStore;
  private _connected = false;
  /** True when [refresh] could not reach the server but loaded schema from persist/cache. */
  private _offlineSchema = false;
  /** Refresh orchestrator: coalesces concurrent requests and wraps fetches in a safety timeout. */
  private readonly _refreshOrchestrator: TreeRefreshOrchestrator;
  /** Fires after [refresh] fully completes (for syncing connection UI). */
  postRefreshHook?: () => void;

  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    TreeNode | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    client: DriftApiClient,
    annotationStore?: AnnotationStore,
    isDriftUiConnected?: () => boolean,
    log?: LogSink,
  ) {
    this._client = client;
    this._annotationStore = annotationStore;
    this._isDriftUiConnected = isDriftUiConnected ?? (() => false);
    // Pass a live accessor, not this._pinStore: the pin store is assigned by
    // setPinStore() AFTER construction, so a captured value would always be undefined.
    this._refreshOrchestrator = createTreeRefreshOrchestrator(client, () => this._pinStore, log);
    // Drives viewsWelcome "when": `serverConnected && databaseTreeEmpty` so a stale
    // `driftViewer.serverConnected` (VM/HTTP) cannot hide all guidance while the tree stays empty.
    this._syncDatabaseTreeEmptyContext();
  }

  /**
   * Sets `driftViewer.databaseTreeEmpty` context for viewsWelcome overlays.
   *
   * The tree now always returns items (disconnected actions, REST failure actions,
   * or schema rows), so `databaseTreeEmpty` is always false. viewsWelcome markdown
   * `command:` links are unreliable in some VS Code forks; real TreeItem rows with
   * `.command` properties are used instead for all states.
   */
  private _syncDatabaseTreeEmptyContext(): void {
    void vscode.commands.executeCommand(
      'setContext',
      'driftViewer.databaseTreeEmpty',
      false,
    );
  }

  setPinStore(store: PinStore): void {
    this._pinStore = store;
  }

  setGroupingStore(store: TableGroupingStore): void {
    this._groupingStore = store;
  }

  /**
   * Re-render the tree from the current in-memory schema without re-fetching
   * from the server. Used by the "group tables by name" toggle: the table set
   * is unchanged, only its presentation differs.
   */
  rerender(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * When discovery/VM connection state changes without a completed [refresh], the REST-failure
   * action rows and `driftViewer.databaseTreeEmpty` must update. Called after connection UI sync.
   */
  notifyConnectionPresentationChanged(): void {
    this._syncDatabaseTreeEmptyContext();
    this._onDidChangeTreeData.fire();
  }

  /**
   * Fetch schema from server and re-render the tree.
   *
   * **Coalescing:** concurrent calls are merged into a single queued refresh
   * that runs after the in-flight one completes (prevents the discovery-triggered
   * refresh from being silently dropped while the initial `loadOnConnect` refresh
   * is still in flight).
   *
   * **Safety timeout:** the entire refresh cycle is wrapped in a `Promise.race`
   * so that pending refreshes are always cleared even if `health()` or
   * `schemaMetadata()` hang due to the Windows/undici AbortController bug.
   * Without this, a single hanging `health()` call permanently deadlocks
   * every future refresh — including the coalesced discovery-triggered one
   * that would have succeeded.
   */
  async refresh(): Promise<void> {
    // Global kill switch: no health probe, no schema fetch — the switch
    // promises zero background traffic, and the child resolver renders the
    // blank-state banner instead of the table list. State is cleared so a
    // later resume starts from a clean fetch rather than stale tables.
    if (isMonitoringKilled()) {
      this._tables = [];
      this._tableItems = [];
      this._connected = false;
      this._offlineSchema = false;
      this._syncDatabaseTreeEmptyContext();
      this._onDidChangeTreeData.fire();
      this.postRefreshHook?.();
      return;
    }

    // Clear the offline flag synchronously at the start of a fetch (matching the
    // pre-refactor behavior): a getChildren() that races the in-flight fetch must
    // not still report an offline schema from the previous cycle.
    this._offlineSchema = false;

    await this._refreshOrchestrator.refresh(
      (state) => {
        // Apply fetched state (success path only; on abort the state is left
        // untouched so the last-known/offline schema stays visible).
        this._tables = state.tables;
        this._tableItems = state.tableItems;
        this._connected = state.connected;
        this._offlineSchema = state.offlineSchema;
      },
      () => {
        // Post-refresh cleanup, runs after both success and abort.
        this._syncDatabaseTreeEmptyContext();
        this._onDidChangeTreeData.fire();
        this.postRefreshHook?.();
      },
      // Coalesced pending re-run re-enters refresh() so the kill switch is re-checked.
      () => this.refresh(),
    );
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeNode): Promise<TreeNode[]> {
    try {
      return await this._getChildrenInner(element);
    } catch {
      // Never throw: return empty so the view never shows "no data provider" errors.
      return [];
    }
  }

  /**
   * Delegates to [resolveChildren] from drift-tree-children.ts, passing a
   * snapshot of the current tree state so the resolution logic stays
   * in a separate module (keeps this file under the line cap).
   */
  private async _getChildrenInner(element?: TreeNode): Promise<TreeNode[]> {
    return resolveChildren(element, {
      client: this._client,
      connected: this._connected,
      offlineSchema: this._offlineSchema,
      isDriftUiConnected: this._isDriftUiConnected,
      monitoringKilled: isMonitoringKilled(),
      tableItems: this._tableItems,
      annotationStore: this._annotationStore,
      grouped: this._groupingStore?.grouped ?? false,
    });
  }

  /** Find a cached TableItem by name (for tree view reveal). */
  findTableItem(name: string): TableItem | undefined {
    return this._tableItems.find((item) => item.table.name === name);
  }

  get connected(): boolean {
    return this._connected;
  }

  /** True when the tree lists tables from cache only (no live health check). */
  get offlineSchema(): boolean {
    return this._offlineSchema;
  }

  /**
   * True when the tree holds a live table list loaded from the REST API (not the offline
   * cache fallback). This is the `schemaLoaded` signal the ConnectionStateMachine reads to
   * separate the `connected` phase from `connecting` (transport up but schema not yet here).
   */
  get hasLiveSchema(): boolean {
    return this._connected && !this._offlineSchema && this._tables.length > 0;
  }

}
