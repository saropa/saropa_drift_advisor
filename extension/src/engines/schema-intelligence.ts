/**
 * SchemaIntelligence: Centralized schema metadata cache with derived insights.
 *
 * Features:
 * - Caches schema metadata (tables, columns, FKs, indexes)
 * - Invalidates cache on generation change
 * - Provides derived insights (missing indexes, type patterns)
 * - Single source of truth for all schema-consuming features
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type {
  Anomaly, ForeignKey, IndexSuggestion, TableMetadata,
} from '../api-types';

/** Cache TTL in milliseconds (30 seconds). */
const CACHE_TTL_MS = 30_000;

export interface ISchemaIndex {
  table: string;
  column: string;
  indexName: string;
  isUnique: boolean;
}

export interface IColumnInsight {
  table: string;
  column: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  hasForeignKey: boolean;
  hasIndex: boolean;
  missingIndex?: IndexSuggestion;
}

export interface ITableInsight {
  name: string;
  rowCount: number;
  columnCount: number;
  hasPrimaryKey: boolean;
  foreignKeyCount: number;
  indexedColumnCount: number;
  anomalyCount: number;
  columns: IColumnInsight[];
}

export interface ISchemaInsights {
  tables: ITableInsight[];
  totalTables: number;
  totalColumns: number;
  totalRows: number;
  missingIndexes: IndexSuggestion[];
  anomalies: Anomaly[];
  tablesWithoutPk: string[];
  orphanedFkTables: string[];
}

export class SchemaIntelligence implements vscode.Disposable {
  private _cache: ISchemaInsights | undefined;
  private _cacheTime = 0;
  private _generation = -1;
  private _loading = false;
  private _loadPromise: Promise<ISchemaInsights> | undefined;

  private readonly _onDidChange = new vscode.EventEmitter<ISchemaInsights>();
  readonly onDidChange = this._onDidChange.event;

  private readonly _disposables: vscode.Disposable[] = [];

  constructor(private readonly _client: DriftApiClient) {
    this._disposables.push(this._onDidChange);
  }

  /** Get cached insights, refreshing if stale or generation changed. */
  async getInsights(forceRefresh = false): Promise<ISchemaInsights> {
    const now = Date.now();
    const cacheValid = this._cache
      && (now - this._cacheTime) < CACHE_TTL_MS
      && !forceRefresh;

    if (cacheValid) {
      return this._cache!;
    }

    if (this._loading && this._loadPromise) {
      return this._loadPromise;
    }

    this._loading = true;
    this._loadPromise = this._loadInsights();

    try {
      this._cache = await this._loadPromise;
      this._cacheTime = Date.now();
      this._onDidChange.fire(this._cache);
      return this._cache;
    } finally {
      this._loading = false;
      this._loadPromise = undefined;
    }
  }

  /** Invalidate cache on generation change. */
  async checkGeneration(): Promise<boolean> {
    try {
      const gen = await this._client.generation(0);
      if (gen !== this._generation) {
        this._generation = gen;
        this._cache = undefined;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /** Get a specific table's insights. */
  async getTable(tableName: string): Promise<ITableInsight | undefined> {
    const insights = await this.getInsights();
    return insights.tables.find((t) => t.name === tableName);
  }

  /** Get a specific column's insights. */
  async getColumn(
    tableName: string, columnName: string,
  ): Promise<IColumnInsight | undefined> {
    const table = await this.getTable(tableName);
    return table?.columns.find((c) => c.column === columnName);
  }

  /** Get all foreign keys for a table. */
  async getForeignKeys(tableName: string): Promise<ForeignKey[]> {
    return this._client.tableFkMeta(tableName);
  }

  /** Get missing index suggestions. */
  async getMissingIndexes(): Promise<IndexSuggestion[]> {
    const insights = await this.getInsights();
    return insights.missingIndexes;
  }

  /** Get all anomalies. */
  async getAnomalies(): Promise<Anomaly[]> {
    const insights = await this.getInsights();
    return insights.anomalies;
  }

  /** Get schema issues (tables without PK, orphaned FKs). */
  async getSchemaIssues(): Promise<{ tablesWithoutPk: string[]; orphanedFkTables: string[] }> {
    const insights = await this.getInsights();
    return {
      tablesWithoutPk: insights.tablesWithoutPk,
      orphanedFkTables: insights.orphanedFkTables,
    };
  }

  /** Clear the cache. */
  invalidate(): void {
    this._cache = undefined;
    this._cacheTime = 0;
  }

  private async _loadInsights(): Promise<ISchemaInsights> {
    const [tables, suggestions, anomalies] = await Promise.all([
      this._client.schemaMetadata(),
      this._client.indexSuggestions(),
      this._client.anomalies(),
    ]);

    const userTables = tables.filter((t) => !t.name.startsWith('sqlite_'));

    const fkMap = new Map<string, ForeignKey[]>();
    await Promise.all(userTables.map(async (t) => {
      fkMap.set(t.name, await this._client.tableFkMeta(t.name));
    }));

    const suggestionMap = new Map<string, IndexSuggestion>();
    for (const s of suggestions) {
      suggestionMap.set(`${s.table}.${s.column}`, s);
    }

    const tableInsights: ITableInsight[] = [];
    const tablesWithoutPk: string[] = [];
    let totalColumns = 0;
    let totalRows = 0;

    for (const table of userTables) {
      const fks = fkMap.get(table.name) ?? [];
      const fkColumns = new Set(fks.map((fk) => fk.fromColumn));

      const hasPk = table.columns.some((c) => c.pk);
      if (!hasPk) {
        tablesWithoutPk.push(table.name);
      }

      const columnInsights: IColumnInsight[] = table.columns.map((col) => {
        const key = `${table.name}.${col.name}`;
        const missingSuggestion = suggestionMap.get(key);
        return {
          table: table.name,
          column: col.name,
          type: col.type,
          nullable: !col.notnull,
          isPrimaryKey: !!col.pk,
          hasForeignKey: fkColumns.has(col.name),
          hasIndex: !missingSuggestion,
          missingIndex: missingSuggestion,
        };
      });

      const anomalyCount = anomalies.filter(
        (a) => a.message.toLowerCase().includes(table.name.toLowerCase()),
      ).length;

      tableInsights.push({
        name: table.name,
        rowCount: table.rowCount,
        columnCount: table.columns.length,
        hasPrimaryKey: hasPk,
        foreignKeyCount: fks.length,
        indexedColumnCount: columnInsights.filter((c) => c.hasIndex).length,
        anomalyCount,
        columns: columnInsights,
      });

      totalColumns += table.columns.length;
      totalRows += table.rowCount;
    }

    const orphanedFkTables = this._findOrphanedFkTables(anomalies);

    return {
      tables: tableInsights,
      totalTables: tableInsights.length,
      totalColumns,
      totalRows,
      missingIndexes: suggestions,
      anomalies,
      tablesWithoutPk,
      orphanedFkTables,
    };
  }

  private _findOrphanedFkTables(anomalies: Anomaly[]): string[] {
    const tables = new Set<string>();
    for (const a of anomalies) {
      if (a.severity === 'error' && a.message.toLowerCase().includes('orphan')) {
        const match = a.message.match(/(\w+)\./);
        if (match) tables.add(match[1]);
      }
    }
    return Array.from(tables);
  }

  dispose(): void {
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}
