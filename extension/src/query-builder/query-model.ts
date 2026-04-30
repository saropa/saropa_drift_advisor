/**
 * Query builder model primitives and mutation helpers.
 *
 * The visual query builder tracks table instances by stable IDs so a single
 * base table can be added multiple times for self-joins.
 */
import type { ColumnMetadata } from '../api-client';

export type JoinType = 'INNER' | 'LEFT' | 'RIGHT';
export type AggregateFn = 'SUM' | 'COUNT' | 'AVG' | 'MIN' | 'MAX';
export type Conjunction = 'AND' | 'OR';

export interface IQueryModel {
  modelVersion: 1;
  tables: IQueryTableInstance[];
  joins: IQueryJoin[];
  selectedColumns: ISelectedColumn[];
  filters: IQueryFilter[];
  groupBy: IGroupByColumn[];
  orderBy: IOrderByClause[];
  limit: number | null;
}

export interface IQueryTableInstance {
  id: string;
  baseTable: string;
  alias: string;
  columns: ColumnMetadata[];
  position: { x: number; y: number };
}

export interface IQueryJoin {
  id: string;
  leftTableId: string;
  leftColumn: string;
  rightTableId: string;
  rightColumn: string;
  type: JoinType;
}

export interface ISelectedColumn {
  tableId: string;
  column: string;
  aggregation?: AggregateFn;
  alias?: string;
}

export type IQueryFilter = IScalarFilter | IInFilter | INullFilter | ILikeFilter;

export interface IScalarFilter {
  id: string;
  tableId: string;
  column: string;
  operator: '=' | '!=' | '<' | '>' | '<=' | '>=';
  value: string | number | boolean;
  conjunction: Conjunction;
}

export interface ILikeFilter {
  id: string;
  tableId: string;
  column: string;
  operator: 'LIKE';
  value: string;
  conjunction: Conjunction;
}

export interface IInFilter {
  id: string;
  tableId: string;
  column: string;
  operator: 'IN';
  values: Array<string | number | boolean>;
  conjunction: Conjunction;
}

export interface INullFilter {
  id: string;
  tableId: string;
  column: string;
  operator: 'IS NULL' | 'IS NOT NULL';
  conjunction: Conjunction;
}

/**
 * Narrows to filters that carry a single `value` (scalar comparison or LIKE).
 * `IN` uses `values`; null filters have neither property — discriminated unions
 * do not always narrow on `operator` alone, so this keeps call sites type-safe.
 */
export function filterHasValue(f: IQueryFilter): f is IScalarFilter | ILikeFilter {
  return 'value' in f;
}

export interface IGroupByColumn {
  tableId: string;
  column: string;
}

export interface IOrderByClause {
  tableId: string;
  column: string;
  direction: 'ASC' | 'DESC';
}

/**
 * Create an empty query model with v1 defaults.
 */
export function createEmptyQueryModel(): IQueryModel {
  return {
    modelVersion: 1,
    tables: [],
    joins: [],
    selectedColumns: [],
    filters: [],
    groupBy: [],
    orderBy: [],
    limit: 100,
  };
}

/** Optional alias when reconstructing SQL import (must stay unique in the model). */
export interface ICreateTableInstanceOptions {
  /** When set, use this alias if not already taken; otherwise fall back to [nextAlias]. */
  forcedAlias?: string;
}

/**
 * Create a table instance with a unique alias for the same base table.
 *
 * @param options.forcedAlias — Used by SQL import to preserve query aliases; if
 *   it collides with an existing instance, [nextAlias] is used instead.
 */
export function createTableInstance(
  model: IQueryModel,
  baseTable: string,
  columns: ColumnMetadata[],
  options?: ICreateTableInstanceOptions,
): IQueryTableInstance {
  const used = new Set(model.tables.map((t) => t.alias));
  let alias: string;
  if (options?.forcedAlias && !used.has(options.forcedAlias)) {
    alias = options.forcedAlias;
  } else {
    alias = nextAlias(model, baseTable);
  }
  return {
    id: makeId('tbl'),
    baseTable,
    alias,
    columns,
    position: { x: 24 + (model.tables.length * 28), y: 24 + (model.tables.length * 28) },
  };
}

/**
 * Remove a table instance and all dependent joins/clauses.
 */
export function removeTableInstance(model: IQueryModel, tableId: string): void {
  model.tables = model.tables.filter((t) => t.id !== tableId);
  model.joins = model.joins.filter((j) => j.leftTableId !== tableId && j.rightTableId !== tableId);
  model.selectedColumns = model.selectedColumns.filter((c) => c.tableId !== tableId);
  model.filters = model.filters.filter((f) => f.tableId !== tableId);
  model.groupBy = model.groupBy.filter((g) => g.tableId !== tableId);
  model.orderBy = model.orderBy.filter((o) => o.tableId !== tableId);
}

/**
 * Generate deterministic aliases based on base table initials.
 */
export function nextAlias(model: IQueryModel, baseTable: string): string {
  const prefix = baseTable
    .split('_')
    .map((part) => part.charAt(0))
    .join('')
    .toLowerCase() || 't';
  let idx = 1;
  let alias = `${prefix}${idx}`;
  const used = new Set(model.tables.map((t) => t.alias));
  while (used.has(alias)) {
    idx++;
    alias = `${prefix}${idx}`;
  }
  return alias;
}

/**
 * Small helper for deterministic IDs in the webview process.
 */
export function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
