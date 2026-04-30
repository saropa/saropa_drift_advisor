/**
 * Query builder webview panel controller.
 *
 * Handles model mutations, SQL preview updates, execution, and integration
 * command dispatch from the webview.
 */
import * as vscode from 'vscode';
import type { DriftApiClient, ForeignKey, TableMetadata } from '../api-client';
import type { QueryIntelligence } from '../engines/query-intelligence';
import type { TableItem } from '../tree/tree-items';
import { SqlNotebookPanel } from '../sql-notebook/sql-notebook-panel';
import {
  createEmptyQueryModel,
  createTableInstance,
  filterHasValue,
  makeId,
  removeTableInstance,
  type AggregateFn,
  type IQueryFilter,
  type IQueryJoin,
  type IQueryModel,
} from './query-model';
import { getQueryBuilderHtml } from './query-builder-html';
import { importSelectSqlToModel } from './sql-import';
import { renderQuerySql, validateQueryModel } from './sql-renderer';

interface IFkContext extends ForeignKey {
  fromTable: string;
}

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
    this._panel.webview.html = getQueryBuilderHtml();
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
    this._post({
      command: 'init',
      tables: this._tables,
      fks: this._fks,
      capabilities: this._capabilities,
      instances: this._model.tables,
    });
    if (this._pendingImportSql) {
      const sql = this._pendingImportSql;
      this._pendingImportSql = undefined;
      await this._applySqlImport(sql);
    }
    this._postState();
  }

  /**
   * Replace the visual model from a SELECT string (best-effort). Shows VS Code
   * messages for hard errors or import warnings.
   */
  private async _applySqlImport(sql: string): Promise<void> {
    const { model, errors, warnings } = importSelectSqlToModel(sql, this._tables);
    if (errors.length > 0) {
      void vscode.window.showErrorMessage(
        `Cannot import SQL into the visual builder: ${errors.join('; ')}`,
      );
      return;
    }
    this._model = model;
    if (warnings.length > 0) {
      void vscode.window.showWarningMessage(
        `Imported with notes: ${warnings.join(' · ')}`,
      );
    } else {
      void vscode.window.showInformationMessage('SQL imported into the visual query builder.');
    }
    this._post({
      command: 'init',
      tables: this._tables,
      fks: this._fks,
      capabilities: this._capabilities,
      instances: this._model.tables,
    });
    this._postState();
  }

  /**
   * Route webview commands to state mutations or integrations.
   */
  private async _handleMessage(msg: Record<string, unknown>): Promise<void> {
    switch (msg.command) {
      case 'addTableInstance':
        await this._addBaseTable(String(msg.baseTable || ''));
        break;
      case 'removeTable':
        removeTableInstance(this._model, String(msg.tableId || ''));
        this._postState();
        break;
      case 'toggleColumn':
        this._toggleColumn(String(msg.tableId || ''), String(msg.column || ''), Boolean(msg.selected));
        this._postState();
        break;
      case 'addJoin':
        this._addJoin(msg.join as Partial<IQueryJoin>);
        this._postState();
        break;
      case 'removeJoin':
        this._model.joins = this._model.joins.filter((j) => j.id !== String(msg.joinId || ''));
        this._postState();
        break;
      case 'addFilter':
        this._addFilter(msg.filter as Record<string, unknown>);
        this._postState();
        break;
      case 'removeFilter':
        this._model.filters = this._model.filters.filter((f) => f.id !== String(msg.id || ''));
        this._postState();
        break;
      case 'setLimit':
        this._model.limit = typeof msg.limit === 'number' && Number.isFinite(msg.limit) ? msg.limit : null;
        this._postState();
        break;
      case 'addGroupBy': {
        const tableId = String(msg.tableId || '');
        const column = String(msg.column || '');
        if (!tableId || !column) break;
        const dup = this._model.groupBy.some((g) => g.tableId === tableId && g.column === column);
        if (!dup) {
          this._model.groupBy.push({ tableId, column });
        }
        this._postState();
        break;
      }
      case 'removeGroupBy': {
        const gIdx = Number(msg.index);
        if (Number.isInteger(gIdx) && gIdx >= 0 && gIdx < this._model.groupBy.length) {
          this._model.groupBy.splice(gIdx, 1);
        }
        this._postState();
        break;
      }
      case 'addOrderBy': {
        const otId = String(msg.tableId || '');
        const oCol = String(msg.column || '');
        const dirRaw = String(msg.direction || 'ASC').toUpperCase();
        const direction = dirRaw === 'DESC' ? 'DESC' : 'ASC';
        if (!otId || !oCol) break;
        this._model.orderBy.push({ tableId: otId, column: oCol, direction });
        this._postState();
        break;
      }
      case 'removeOrderBy': {
        const oIdx = Number(msg.index);
        if (Number.isInteger(oIdx) && oIdx >= 0 && oIdx < this._model.orderBy.length) {
          this._model.orderBy.splice(oIdx, 1);
        }
        this._postState();
        break;
      }
      case 'setAggregation': {
        const stId = String(msg.tableId || '');
        const sCol = String(msg.column || '');
        const sel = this._model.selectedColumns.find((c) => c.tableId === stId && c.column === sCol);
        if (!sel) break;
        const rawAgg = msg.aggregation;
        if (rawAgg === null || rawAgg === undefined || rawAgg === '') {
          delete sel.aggregation;
          delete sel.alias;
        } else {
          const a = String(rawAgg).toUpperCase();
          if (['SUM', 'COUNT', 'AVG', 'MIN', 'MAX'].includes(a)) {
            sel.aggregation = a as AggregateFn;
          }
        }
        this._postState();
        break;
      }
      case 'runQuery':
        await this._runQuery(String(msg.requestId || ''));
        break;
      case 'copySql':
        await this._copySql();
        break;
      case 'openInNotebook':
        await this._openInNotebook();
        break;
      case 'saveAsSnippet':
        await this._saveAsSnippet();
        break;
      case 'analyzeCost':
        await this._analyzeCost();
        break;
      case 'addToDashboard':
        await this._addToDashboard();
        break;
      default:
        break;
    }
  }

  /**
   * Add a new table instance and auto-suggest one FK join.
   */
  private async _addBaseTable(baseTable: string): Promise<void> {
    const meta = this._tables.find((t) => t.name === baseTable);
    if (!meta) return;
    const instance = createTableInstance(this._model, baseTable, meta.columns);
    this._model.tables.push(instance);
    this._autoSuggestJoinFor(instance.id);
    this._postState();
  }

  private _toggleColumn(tableId: string, column: string, selected: boolean): void {
    const idx = this._model.selectedColumns.findIndex((c) => c.tableId === tableId && c.column === column);
    if (selected && idx < 0) {
      this._model.selectedColumns.push({ tableId, column });
    } else if (!selected && idx >= 0) {
      this._model.selectedColumns.splice(idx, 1);
    }
  }

  private _addJoin(input: Partial<IQueryJoin>): void {
    if (!input.leftTableId || !input.rightTableId || !input.leftColumn || !input.rightColumn) return;
    this._model.joins.push({
      id: makeId('join'),
      leftTableId: input.leftTableId,
      leftColumn: input.leftColumn,
      rightTableId: input.rightTableId,
      rightColumn: input.rightColumn,
      type: (input.type as IQueryJoin['type']) ?? 'LEFT',
    });
  }

  /**
   * Parse and add a filter payload from the webview.
   */
  private _addFilter(raw: Record<string, unknown>): void {
    const tableId = String(raw.tableId || '');
    const column = String(raw.column || '');
    const operator = String(raw.operator || '=');
    const valueText = String(raw.valueText ?? '');
    let filter: IQueryFilter | undefined;
    if (operator === 'IS NULL' || operator === 'IS NOT NULL') {
      filter = { id: makeId('flt'), tableId, column, operator, conjunction: 'AND' };
    } else if (operator === 'IN') {
      const values = valueText
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
      filter = { id: makeId('flt'), tableId, column, operator: 'IN', values, conjunction: 'AND' };
    } else if (operator === 'LIKE') {
      filter = { id: makeId('flt'), tableId, column, operator: 'LIKE', value: valueText, conjunction: 'AND' };
    } else {
      filter = {
        id: makeId('flt'),
        tableId,
        column,
        operator: operator as '=' | '!=' | '<' | '>' | '<=' | '>=',
        value: coerceScalar(valueText),
        conjunction: 'AND',
      };
    }
    this._model.filters.push(filter);
  }

  /**
   * Try to add one FK-based join to connect a newly added table instance.
   */
  private _autoSuggestJoinFor(newTableId: string): void {
    const newlyAdded = this._model.tables.find((t) => t.id === newTableId);
    if (!newlyAdded) return;
    const existing = this._model.tables.filter((t) => t.id !== newTableId);
    for (const other of existing) {
      const fk = this._fks.find((f) => (
        (f.fromTable === newlyAdded.baseTable && f.toTable === other.baseTable)
        || (f.fromTable === other.baseTable && f.toTable === newlyAdded.baseTable)
      ));
      if (!fk) continue;
      if (fk.fromTable === newlyAdded.baseTable) {
        this._model.joins.push({
          id: makeId('join'),
          leftTableId: other.id,
          leftColumn: fk.toColumn,
          rightTableId: newlyAdded.id,
          rightColumn: fk.fromColumn,
          type: 'LEFT',
        });
      } else {
        this._model.joins.push({
          id: makeId('join'),
          leftTableId: newlyAdded.id,
          leftColumn: fk.toColumn,
          rightTableId: other.id,
          rightColumn: fk.fromColumn,
          type: 'LEFT',
        });
      }
      return;
    }
  }

  private async _runQuery(requestId: string): Promise<void> {
    const errors = validateQueryModel(this._model);
    if (errors.length > 0) {
      this._post({ command: 'queryError', requestId, message: errors.join('\n') });
      this._postState();
      return;
    }
    try {
      const sql = renderQuerySql(this._model);
      const t0 = Date.now();
      const result = await this._client.sql(sql);
      const elapsed = Date.now() - t0;
      try {
        this._queryIntelligence?.recordQuery(sql, elapsed, result.rows.length);
      } catch {
        // Pattern store is best-effort; never block the results grid.
      }
      this._post({
        command: 'queryResult',
        requestId,
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rows.length,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this._post({ command: 'queryError', requestId, message });
    }
  }

  private async _copySql(): Promise<void> {
    try {
      const sql = renderQuerySql(this._model);
      await vscode.env.clipboard.writeText(sql);
      void vscode.window.showInformationMessage('SQL copied to clipboard.');
    } catch (err: unknown) {
      this._integrationError('notebook', err);
    }
  }

  private async _openInNotebook(): Promise<void> {
    try {
      const sql = renderQuerySql(this._model);
      SqlNotebookPanel.showAndInsertQuery(this._context, this._client, {
        sql,
        title: 'Visual query builder',
        source: 'query-builder',
      });
    } catch (err: unknown) {
      this._integrationError('notebook', err);
    }
  }

  private async _saveAsSnippet(): Promise<void> {
    try {
      const sql = renderQuerySql(this._model);
      await vscode.commands.executeCommand('driftViewer.saveAsSnippet', sql);
    } catch (err: unknown) {
      this._integrationError('snippet', err);
    }
  }

  private async _analyzeCost(): Promise<void> {
    try {
      const sql = renderQuerySql(this._model);
      await vscode.commands.executeCommand('driftViewer.analyzeQueryCost', sql);
    } catch (err: unknown) {
      this._integrationError('cost', err);
    }
  }

  private async _addToDashboard(): Promise<void> {
    try {
      const sql = renderQuerySql(this._model);
      await vscode.commands.executeCommand(
        'driftViewer.addQueryWidgetToDashboard',
        sql,
        'Visual query builder',
      );
    } catch (err: unknown) {
      this._integrationError('dashboard', err);
    }
  }

  private _integrationError(target: 'notebook' | 'snippet' | 'dashboard' | 'cost', err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this._post({ command: 'integrationError', target, message });
  }

  /**
   * Post current model and SQL preview state.
   */
  private _postState(): void {
    let sql = '';
    let validationErrors = validateQueryModel(this._model);
    if (validationErrors.length === 0) {
      sql = renderQuerySql(this._model);
    }
    const tableById = new Map(this._model.tables.map((t) => [t.id, t]));
    const joinLabels = this._model.joins.map((j) => ({
      id: j.id,
      type: j.type,
      leftAlias: tableById.get(j.leftTableId)?.alias ?? '?',
      leftColumn: j.leftColumn,
      rightAlias: tableById.get(j.rightTableId)?.alias ?? '?',
      rightColumn: j.rightColumn,
    }));
    const filterLabels = this._model.filters.map((f) => {
      const alias = tableById.get(f.tableId)?.alias ?? '?';
      let tail = '';
      if (f.operator === 'IN') {
        tail = `(${f.values.join(', ')})`;
      } else if (f.operator === 'IS NULL' || f.operator === 'IS NOT NULL') {
        tail = '';
      } else if (filterHasValue(f)) {
        tail = String(f.value);
      }
      return { id: f.id, description: `${alias}.${f.column} ${f.operator} ${tail}`.trim() };
    });
    this._post({
      command: 'state',
      model: this._model,
      sql,
      validationErrors,
      joinLabels,
      filterLabels,
    });
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
 * Parse a scalar literal from text for basic typed filters.
 */
function coerceScalar(input: string): string | number | boolean {
  const t = input.trim();
  if (t.toLowerCase() === 'true') return true;
  if (t.toLowerCase() === 'false') return false;
  const asNum = Number(t);
  if (t !== '' && Number.isFinite(asNum)) return asNum;
  return t;
}

/**
 * Extract table name from tree context command argument safely.
 */
export function tableNameFromTreeArg(arg: unknown): string | undefined {
  const item = arg as TableItem | undefined;
  if (!item || typeof item !== 'object') return undefined;
  return item.table?.name;
}
