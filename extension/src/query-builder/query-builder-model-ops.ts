/**
 * Pure model-mutation helpers for the Visual Query Builder panel: add a base
 * table (with auto FK-join suggestion), toggle a selected column, add a join or
 * filter, and build the webview state payload (SQL preview + validation +
 * join/filter labels). Extracted from query-builder-panel.ts so the panel class
 * holds only webview lifecycle and message routing. All functions mutate the
 * passed [IQueryModel] in place or derive from it — no webview access.
 */
import type { ForeignKey, TableMetadata } from '../api-client';
import {
  createTableInstance,
  filterHasValue,
  makeId,
  type AggregateFn,
  type IQueryFilter,
  type IQueryJoin,
  type IQueryModel,
} from './query-model';
import { renderQuerySql, validateQueryModel } from './sql-renderer';

/** A foreign key annotated with the table it originates from. */
export interface IFkContext extends ForeignKey {
  fromTable: string;
}

/** Add a new table instance and auto-suggest one FK join to connect it. */
export function addBaseTable(
  model: IQueryModel,
  tables: TableMetadata[],
  fks: IFkContext[],
  baseTable: string,
): void {
  const meta = tables.find((t) => t.name === baseTable);
  if (!meta) return;
  const instance = createTableInstance(model, baseTable, meta.columns);
  model.tables.push(instance);
  autoSuggestJoinFor(model, fks, instance.id);
}

export function toggleColumn(
  model: IQueryModel,
  tableId: string,
  column: string,
  selected: boolean,
): void {
  const idx = model.selectedColumns.findIndex((c) => c.tableId === tableId && c.column === column);
  if (selected && idx < 0) {
    model.selectedColumns.push({ tableId, column });
  } else if (!selected && idx >= 0) {
    model.selectedColumns.splice(idx, 1);
  }
}

export function addJoin(model: IQueryModel, input: Partial<IQueryJoin>): void {
  if (!input.leftTableId || !input.rightTableId || !input.leftColumn || !input.rightColumn) return;
  model.joins.push({
    id: makeId('join'),
    leftTableId: input.leftTableId,
    leftColumn: input.leftColumn,
    rightTableId: input.rightTableId,
    rightColumn: input.rightColumn,
    type: (input.type as IQueryJoin['type']) ?? 'LEFT',
  });
}

/** Parse and add a filter payload from the webview. */
export function addFilter(model: IQueryModel, raw: Record<string, unknown>): void {
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
  model.filters.push(filter);
}

/** Try to add one FK-based join to connect a newly added table instance. */
export function autoSuggestJoinFor(
  model: IQueryModel,
  fks: IFkContext[],
  newTableId: string,
): void {
  const newlyAdded = model.tables.find((t) => t.id === newTableId);
  if (!newlyAdded) return;
  const existing = model.tables.filter((t) => t.id !== newTableId);
  for (const other of existing) {
    const fk = fks.find((f) => (
      (f.fromTable === newlyAdded.baseTable && f.toTable === other.baseTable)
      || (f.fromTable === other.baseTable && f.toTable === newlyAdded.baseTable)
    ));
    if (!fk) continue;
    if (fk.fromTable === newlyAdded.baseTable) {
      model.joins.push({
        id: makeId('join'),
        leftTableId: other.id,
        leftColumn: fk.toColumn,
        rightTableId: newlyAdded.id,
        rightColumn: fk.fromColumn,
        type: 'LEFT',
      });
    } else {
      model.joins.push({
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

export function addGroupBy(model: IQueryModel, tableId: string, column: string): void {
  if (!tableId || !column) return;
  const dup = model.groupBy.some((g) => g.tableId === tableId && g.column === column);
  if (!dup) {
    model.groupBy.push({ tableId, column });
  }
}

export function removeGroupBy(model: IQueryModel, index: number): void {
  if (Number.isInteger(index) && index >= 0 && index < model.groupBy.length) {
    model.groupBy.splice(index, 1);
  }
}

export function addOrderBy(
  model: IQueryModel,
  tableId: string,
  column: string,
  direction: 'ASC' | 'DESC',
): void {
  if (!tableId || !column) return;
  model.orderBy.push({ tableId, column, direction });
}

export function removeOrderBy(model: IQueryModel, index: number): void {
  if (Number.isInteger(index) && index >= 0 && index < model.orderBy.length) {
    model.orderBy.splice(index, 1);
  }
}

/** Set or clear the aggregation on a selected column (clears alias when removed). */
export function setAggregation(
  model: IQueryModel,
  tableId: string,
  column: string,
  rawAgg: unknown,
): void {
  const sel = model.selectedColumns.find((c) => c.tableId === tableId && c.column === column);
  if (!sel) return;
  if (rawAgg === null || rawAgg === undefined || rawAgg === '') {
    delete sel.aggregation;
    delete sel.alias;
    return;
  }
  const a = String(rawAgg).toUpperCase();
  if (['SUM', 'COUNT', 'AVG', 'MIN', 'MAX'].includes(a)) {
    sel.aggregation = a as AggregateFn;
  }
}

/** Shape of the `state` payload sent to the webview after every mutation. */
export interface IQueryBuilderStatePayload {
  model: IQueryModel;
  sql: string;
  validationErrors: string[];
  joinLabels: Array<{
    id: string;
    type: IQueryJoin['type'];
    leftAlias: string;
    leftColumn: string;
    rightAlias: string;
    rightColumn: string;
  }>;
  filterLabels: Array<{ id: string; description: string }>;
}

/** Compute the model + SQL preview + join/filter labels for the webview. */
export function buildStatePayload(model: IQueryModel): IQueryBuilderStatePayload {
  let sql = '';
  const validationErrors = validateQueryModel(model);
  if (validationErrors.length === 0) {
    sql = renderQuerySql(model);
  }
  const tableById = new Map(model.tables.map((t) => [t.id, t]));
  const joinLabels = model.joins.map((j) => ({
    id: j.id,
    type: j.type,
    leftAlias: tableById.get(j.leftTableId)?.alias ?? '?',
    leftColumn: j.leftColumn,
    rightAlias: tableById.get(j.rightTableId)?.alias ?? '?',
    rightColumn: j.rightColumn,
  }));
  const filterLabels = model.filters.map((f) => {
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
  return { model, sql, validationErrors, joinLabels, filterLabels };
}

/** Parse a scalar literal from text for basic typed filters. */
export function coerceScalar(input: string): string | number | boolean {
  const t = input.trim();
  if (t.toLowerCase() === 'true') return true;
  if (t.toLowerCase() === 'false') return false;
  const asNum = Number(t);
  if (t !== '' && Number.isFinite(asNum)) return asNum;
  return t;
}
