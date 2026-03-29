/**
 * Database Explorer tree: tables, columns, quick actions, and a fallback row list when the
 * extension reports a Drift connection but REST schema load failed. That fallback uses
 * [TreeItem.command] (reliable across hosts) instead of relying on `viewsWelcome` markdown
 * `command:` links, which may not execute in some VS Code forks.
 */
import * as vscode from 'vscode';
import { DriftApiClient, TableMetadata } from '../api-client';
import type { AnnotationStore } from '../annotations/annotation-store';
import type { PinStore } from './pin-store';
import {
  ColumnItem,
  ConnectionStatusItem,
  ForeignKeyItem,
  PinnedGroupItem,
  SchemaRestFailureBannerItem,
  TableItem,
} from './tree-items';
import {
  ActionCategoryItem,
  ActionItem,
  getQuickActionCategories,
  getSchemaRestFailureActions,
  QuickActionsGroupItem,
} from './quick-action-items';

type TreeNode =
  | ConnectionStatusItem
  | SchemaRestFailureBannerItem
  | PinnedGroupItem
  | QuickActionsGroupItem
  | ActionCategoryItem
  | ActionItem
  | TableItem
  | ColumnItem
  | ForeignKeyItem;

/**
 * Maximum wall-clock time (ms) a single [refresh] cycle may take before being
 * force-aborted. This is a last-resort safety net: if both the
 * `fetchWithTimeout` AbortController AND the per-call timeout somehow hang
 * (observed on some Windows/undici builds), this ensures `_refreshing` is
 * cleared so coalesced pending refreshes are not blocked forever.
 *
 * Set generously — well above the worst-case for
 * `health()` (8s + retry 8s) + `schemaMetadata()` (30s cache safety)
 * so it never interferes with legitimate slow responses.
 */
const REFRESH_SAFETY_TIMEOUT_MS = 55_000;

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
  private _connected = false;
  /** True when [refresh] could not reach the server but loaded schema from persist/cache. */
  private _offlineSchema = false;
  private _refreshing = false;
  /** When true, another refresh will run after the current one completes (coalesced). */
  private _pendingRefresh = false;
  /** Fires after [refresh] fully completes (for syncing Schema Search / connection UI). */
  postRefreshHook?: () => void;

  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    TreeNode | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    client: DriftApiClient,
    annotationStore?: AnnotationStore,
    isDriftUiConnected?: () => boolean,
  ) {
    this._client = client;
    this._annotationStore = annotationStore;
    this._isDriftUiConnected = isDriftUiConnected ?? (() => false);
    // Drives viewsWelcome "when": `serverConnected && databaseTreeEmpty` so a stale
    // `driftViewer.serverConnected` (VM/HTTP) cannot hide all guidance while the tree stays empty.
    this._syncDatabaseTreeEmptyContext();
  }

  /**
   * Drives the "connected but tree empty" welcome. When showing offline cached schema,
   * we are not "live connected" but the tree is not empty — avoid that overlay.
   *
   * When the UI is connected but REST schema load failed, we show real tree rows with
   * `command` fields and set [databaseTreeEmpty] false so the markdown `viewsWelcome`
   * overlay (unreliable in some hosts) is hidden.
   */
  private _syncDatabaseTreeEmptyContext(): void {
    const noSchemaRows = !this._connected && !this._offlineSchema;
    const hideWelcomeForRestFailure = noSchemaRows && this._isDriftUiConnected();
    void vscode.commands.executeCommand(
      'setContext',
      'driftViewer.databaseTreeEmpty',
      noSchemaRows && !hideWelcomeForRestFailure,
    );
  }

  setPinStore(store: PinStore): void {
    this._pinStore = store;
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
   * with [REFRESH_SAFETY_TIMEOUT_MS] so that `_refreshing` is always cleared
   * even if `health()` or `schemaMetadata()` hang due to the Windows/undici
   * AbortController bug (same root cause as `SchemaCache.FETCH_SAFETY_TIMEOUT_MS`).
   * Without this, a single hanging `health()` call permanently deadlocks
   * every future refresh — including the coalesced discovery-triggered one
   * that would have succeeded.
   */
  async refresh(): Promise<void> {
    if (this._refreshing) {
      // Queue a follow-up refresh instead of silently dropping the call.
      this._pendingRefresh = true;
      return;
    }
    this._refreshing = true;
    this._pendingRefresh = false;
    this._offlineSchema = false;

    // Last-resort safety: reject if the inner work hangs beyond all per-call
    // timeouts (AbortController + schema cache safety). Uses setTimeout +
    // Promise.race — does not depend on AbortController, so it always fires.
    let safetyTimer: ReturnType<typeof setTimeout> | undefined;
    const safety = new Promise<never>((_, reject) => {
      safetyTimer = setTimeout(
        () => reject(new Error('Tree refresh safety timeout')),
        REFRESH_SAFETY_TIMEOUT_MS,
      );
    });

    try {
      await Promise.race([this._refreshInner(), safety]);
    } catch {
      // _refreshInner handles its own error state; safety timeout also lands here.
    } finally {
      if (safetyTimer !== undefined) clearTimeout(safetyTimer);
      this._refreshing = false;
    }
    this._syncDatabaseTreeEmptyContext();
    this._onDidChangeTreeData.fire();
    this.postRefreshHook?.();

    // Run the coalesced pending refresh (e.g. discovery found the server while
    // the initial loadOnConnect refresh was still in flight and failed).
    if (this._pendingRefresh) {
      this._pendingRefresh = false;
      void this.refresh();
    }
  }

  /**
   * Inner refresh logic extracted so [refresh] can wrap it in a safety
   * `Promise.race` without duplicating the try/catch/finally structure.
   */
  private async _refreshInner(): Promise<void> {
    try {
      await this._client.health();
      this._tables = await this._client.schemaMetadata();
      this._tableItems = this._tables.map(
        (t) => new TableItem(t, this._pinStore?.isPinned(t.name)),
      );
      this._connected = true;
    } catch {
      this._connected = false;
      this._tables = [];
      this._tableItems = [];
      const allowOffline =
        vscode.workspace.getConfiguration('driftViewer').get<boolean>(
          'database.allowOfflineSchema',
          true,
        ) !== false;
      if (allowOffline) {
        try {
          // Cached client may return workspace-persisted last-known schema without a live server.
          this._tables = await this._client.schemaMetadata();
          if (this._tables.length > 0) {
            this._offlineSchema = true;
            this._tableItems = this._tables.map(
              (t) => new TableItem(t, this._pinStore?.isPinned(t.name)),
            );
          }
        } catch {
          this._tables = [];
          this._tableItems = [];
        }
      }
    }
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

  private async _getChildrenInner(element?: TreeNode): Promise<TreeNode[]> {
    // Root level: empty only when we have nothing to show (disconnected and no cached schema).
    if (!element) {
      if (!this._connected && !this._offlineSchema) {
        // Hosts where welcome-view markdown `command:` links do nothing still execute
        // TreeItem.command, so surface the same actions as rows.
        if (this._isDriftUiConnected()) {
          return [
            new SchemaRestFailureBannerItem(),
            ...getSchemaRestFailureActions(),
          ];
        }
        return [];
      }
      const status = new ConnectionStatusItem(
        this._client.connectionDisplayName,
        this._connected,
        this._offlineSchema,
      );
      this._decorateTableItems();

      const pinned = this._tableItems.filter((t) => t.pinned);
      const unpinned = this._tableItems.filter((t) => !t.pinned);
      const items: TreeNode[] = [status];
      // Quick Actions shortcut group — lets users discover key commands
      items.push(new QuickActionsGroupItem());
      if (pinned.length > 0) {
        items.push(new PinnedGroupItem(pinned.length));
      }
      items.push(...pinned, ...unpinned);
      return items;
    }

    // Quick Actions group → return categorised action lists
    if (element instanceof QuickActionsGroupItem) {
      return getQuickActionCategories();
    }
    if (element instanceof ActionCategoryItem) {
      return element.actions;
    }

    // Table level: columns + foreign keys (lazy-loaded)
    if (element instanceof TableItem) {
      const columns = element.table.columns.map(
        (c) => new ColumnItem(c, element.table.name),
      );
      this._decorateColumnItems(columns, element.table.name);
      let fks: ForeignKeyItem[] = [];
      try {
        const fkData = await this._client.tableFkMeta(element.table.name);
        fks = fkData.map((fk) => new ForeignKeyItem(fk));
      } catch {
        // FK fetch failed — show columns only
      }
      return [...columns, ...fks];
    }

    return [];
  }

  /** Append annotation count to table item descriptions. */
  private _decorateTableItems(): void {
    if (!this._annotationStore) return;
    for (const item of this._tableItems) {
      // Reset to base description to avoid accumulation on repeated calls
      const rc = item.table.rowCount;
      const base = `${rc} ${rc === 1 ? 'row' : 'rows'}`;
      const count = this._annotationStore.countForTable(
        item.table.name,
      );
      item.description = count > 0
        ? `${base} \u00B7 ${count === 1 ? '1 note' : `${count} notes`}`
        : base;
    }
  }

  /** Append annotation indicator to column item descriptions. */
  private _decorateColumnItems(
    columns: ColumnItem[],
    tableName: string,
  ): void {
    if (!this._annotationStore) return;
    for (const col of columns) {
      const has = this._annotationStore.hasAnnotations(
        tableName,
        col.column.name,
      );
      if (has) {
        col.description = `${col.description} \u00B7 \u{1F4CC}`;
      }
    }
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
   * True when the tree has a non-empty table list from REST or offline cache.
   * Used by Schema Search so we do not enable search while the UI is "connected"
   * but table metadata never loaded (REST failure banner state).
   */
  isSchemaSearchAvailable(): boolean {
    return this._tables.length > 0;
  }
}
