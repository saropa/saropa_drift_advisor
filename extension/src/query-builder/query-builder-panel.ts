/**
 * Query builder webview panel controller.
 *
 * Owns the webview lifecycle, schema/FK loading, and message routing. Model
 * mutations live in query-builder-model-ops.ts and integration command handlers
 * in query-builder-integrations.ts; this class wires the webview to them.
 */
import * as vscode from 'vscode';
import type { DriftApiClient, ForeignKey, TableMetadata } from '../api-client';
import type { QueryIntelligence } from '../engines/query-intelligence';
import type { TableItem } from '../tree/tree-items';
import {
  createEmptyQueryModel,
  type IQueryModel,
} from './query-model';
import { getQueryBuilderHtml } from './query-builder-html';
import { applySqlImport } from './query-builder-import';
import {
  addBaseTable,
  buildStatePayload,
  type IFkContext,
} from './query-builder-model-ops';
import { handleQbMessage } from './query-builder-message-handler';
import { secureWebviewHtml } from '../webview-csp';

interface IBuilderCapabilities {
  notebook: boolean;
  snippet: boolean;
  dashboard: boolean;
  cost: boolean;
}

/**
 * Singleton panel for visual query building.
 */
export class QueryBuilderPanel implements vscode.Disposable {
  static currentPanel: QueryBuilderPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];
  private _disposed = false;
  private _model: IQueryModel = createEmptyQueryModel();
  private _tables: TableMetadata[] = [];
  private _fks: IFkContext[] = [];
  /** When set, applied after schema load (NL-SQL / history / command import). */
  private _pendingImportSql: string | undefined;
  /** Optional: records successful runs for join/WHERE pattern hints (best-effort). */
  private _queryIntelligence: QueryIntelligence | undefined;
  private readonly _capabilities: IBuilderCapabilities = {
    notebook: true,
    snippet: true,
    dashboard: true,
    cost: true,
  };

  /**
   * Create or reveal the query builder panel.
   */
  static createOrShow(
    context: vscode.ExtensionContext,
    client: DriftApiClient,
    initialTableName?: string,
    options?: { importSql?: string; queryIntelligence?: QueryIntelligence },
  ): void {
    if (QueryBuilderPanel.currentPanel) {
      QueryBuilderPanel.currentPanel._panel.reveal(vscode.ViewColumn.Active);
      if (options?.queryIntelligence !== undefined) {
        QueryBuilderPanel.currentPanel._queryIntelligence = options.queryIntelligence;
      }
      if (options?.importSql) {
        void QueryBuilderPanel.currentPanel._applySqlImport(options.importSql);
      } else if (initialTableName) {
        void QueryBuilderPanel.currentPanel._addBaseTable(initialTableName);
      }
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'driftQueryBuilder',
      'Visual Query Builder',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    const instance = new QueryBuilderPanel(panel, context, client, {
      pendingImportSql: options?.importSql,
      queryIntelligence: options?.queryIntelligence,
    });
    QueryBuilderPanel.currentPanel = instance;
    context.subscriptions.push(instance);
    if (!options?.importSql && initialTableName) {
      void instance._addBaseTable(initialTableName);
    }
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly _context: vscode.ExtensionContext,
    private readonly _client: DriftApiClient,
    panelOptions?: { pendingImportSql?: string; queryIntelligence?: QueryIntelligence },
  ) {
    this._pendingImportSql = panelOptions?.pendingImportSql;
    this._queryIntelligence = panelOptions?.queryIntelligence;
    void this._context;
    this._panel = panel;
    this._panel.webview.html = secureWebviewHtml(getQueryBuilderHtml());
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage((msg) => {
      void this._handleMessage(msg as Record<string, unknown>);
    }, null, this._disposables);
    void this._initialize();
  }

  /**
   * Load schema + FK metadata and send initial payload.
   */
  private async _initialize(): Promise<void> {
    try {
      this._tables = await this._client.schemaMetadata();
      const fkPromises = this._tables.map(async (table) => {
        const fks = await this._client.tableFkMeta(table.name).catch(() => [] as ForeignKey[]);
        return fks.map((fk) => ({ ...fk, fromTable: table.name }));
      });
      this._fks = (await Promise.all(fkPromises)).flat();
    } catch {
      this._tables = [];
      this._fks = [];
    }
    this._postInit();
    if (this._pendingImportSql) {
      const sql = this._pendingImportSql;
      this._pendingImportSql = undefined;
      await this._applySqlImport(sql);
    }
    this._postState();
  }

  /** Send the `init` payload (schema, FKs, capabilities, current instances). */
  private _postInit(): void {
    this._post({
      command: 'init',
      tables: this._tables,
      fks: this._fks,
      capabilities: this._capabilities,
      instances: this._model.tables,
    });
  }

  /**
   * Replace the visual model from a SELECT string (best-effort). Shows VS Code
   * messages for hard errors or import warnings.
   */
  private async _applySqlImport(sql: string): Promise<void> {
    const model = applySqlImport(sql, this._tables);
    if (!model) return;
    this._model = model;
    this._postInit();
    this._postState();
  }

  /**
   * Route webview commands to state mutations or integrations.
   */
  private async _handleMessage(msg: Record<string, unknown>): Promise<void> {
    await handleQbMessage(
      {
        model: this._model,
        client: this._client,
        extensionContext: this._context,
        queryIntelligence: this._queryIntelligence,
        addBaseTable: (baseTable) => this._addBaseTable(baseTable),
        post: (m) => this._post(m),
        postState: () => this._postState(),
      },
      msg,
    );
  }

  /**
   * Add a base table instance (with auto FK-join) and push new state. Kept as a
   * method because [createOrShow] adds the initial table before any message.
   */
  private async _addBaseTable(baseTable: string): Promise<void> {
    addBaseTable(this._model, this._tables, this._fks, baseTable);
    this._postState();
  }

  /**
   * Post current model and SQL preview state.
   */
  private _postState(): void {
    this._post({ command: 'state', ...buildStatePayload(this._model) });
  }

  private _post(msg: unknown): void {
    if (!this._disposed) {
      void this._panel.webview.postMessage(msg);
    }
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    QueryBuilderPanel.currentPanel = undefined;
    this._panel.dispose();
    for (const d of this._disposables) d.dispose();
    this._disposables.length = 0;
  }
}

/**
 * Extract table name from tree context command argument safely.
 */
export function tableNameFromTreeArg(arg: unknown): string | undefined {
  const item = arg as TableItem | undefined;
  if (!item || typeof item !== 'object') return undefined;
  return item.table?.name;
}
