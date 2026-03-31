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
import { TableItem } from './tree-items';
import { type TreeNode, resolveChildren } from './drift-tree-children';

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
  /** Optional log sink for refresh errors. Prevents silent failure in the tree. */
  private readonly _log?: LogSink;
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
    log?: LogSink,
  ) {
    this._client = client;
    this._annotationStore = annotationStore;
    this._isDriftUiConnected = isDriftUiConnected ?? (() => false);
    this._log = log;
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
    } catch (err: unknown) {
      // Safety timeout or unhandled _refreshInner error.
      const msg = err instanceof Error ? err.message : String(err);
      this._log?.appendLine(`[${new Date().toISOString()}] Tree refresh aborted: ${msg}`);
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
      this._log?.appendLine(
        `[${new Date().toISOString()}] Tree refresh: loaded ${this._tables.length} table(s) from live server.`,
      );
    } catch (err: unknown) {
      // Log the ACTUAL error so "Could not load schema" is never a mystery.
      const msg = err instanceof Error ? err.message : String(err);
      this._log?.appendLine(
        `[${new Date().toISOString()}] Tree refresh FAILED (health or schema): ${msg}`,
      );
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
            this._log?.appendLine(
              `[${new Date().toISOString()}] Tree refresh: fell back to offline schema (${this._tables.length} table(s)).`,
            );
          }
        } catch (offlineErr: unknown) {
          const offlineMsg = offlineErr instanceof Error ? offlineErr.message : String(offlineErr);
          this._log?.appendLine(
            `[${new Date().toISOString()}] Tree refresh: offline schema fallback also failed: ${offlineMsg}`,
          );
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
      tableItems: this._tableItems,
      annotationStore: this._annotationStore,
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
   * True when the tree has a non-empty table list from REST or offline cache.
   * Used by Schema Search so we do not enable search while the UI is "connected"
   * but table metadata never loaded (REST failure banner state).
   */
  isSchemaSearchAvailable(): boolean {
    return this._tables.length > 0;
  }
}
