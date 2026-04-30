/**
 * SQL renderer and validation for the visual query model.
 *
 * Rendering is intentionally deterministic so preview snapshots and tests stay
 * stable as users iterate on the same query.
 */
import {
  filterHasValue,
  type IQueryModel,
  type IQueryJoin,
  type ISelectedColumn,
  type IQueryFilter,
} from './query-model';

/**
 * Build SQL text from the visual query model.
 *
 * Throws when the model has invalid references or impossible SQL states.
 */
export function renderQuerySql(model: IQueryModel): string {
  const errors = validateQueryModel(model);
  if (errors.length > 0) {
    throw new Error(`Invalid query model: ${errors.join('; ')}`);
  }
  const tableById = new Map(model.tables.map((t) => [t.id, t]));
  const parts: string[] = [];

  const selectCols = model.selectedColumns.map((c) => renderSelectedColumn(c, tableById));
  parts.push(`SELECT ${selectCols.length > 0 ? selectCols.join(', ') : '*'}`);

  const root = model.tables[0];
  parts.push(`FROM "${root.baseTable}" AS "${root.alias}"`);

  for (const join of model.joins) {
    parts.push(renderJoin(join, tableById));
  }

  if (model.filters.length > 0) {
    const where = model.filters.map((f, i) => {
      const table = tableById.get(f.tableId)!;
      const ref = `"${table.alias}"."${f.column}"`;
      const prefix = i === 0 ? 'WHERE' : f.conjunction;
      // Use sequential checks so TypeScript narrows IQueryFilter (INullFilter has no `value`).
      if (f.operator === 'IS NULL' || f.operator === 'IS NOT NULL') {
        return `${prefix} ${ref} ${f.operator}`;
      }
      if (f.operator === 'IN') {
        return `${prefix} ${ref} IN (${f.values.map(sqlLiteral).join(', ')})`;
      }
      if (filterHasValue(f)) {
        if (f.operator === 'LIKE') {
          return `${prefix} ${ref} LIKE ${sqlLiteral(f.value)}`;
        }
        return `${prefix} ${ref} ${f.operator} ${sqlLiteral(f.value)}`;
      }
      throw new Error(`Unexpected filter shape for operator: ${String((f as IQueryFilter).operator)}`);
    });
    parts.push(where.join('\n'));
  }

  if (model.groupBy.length > 0) {
    const clauses = model.groupBy.map((g) => {
      const table = tableById.get(g.tableId)!;
      return `"${table.alias}"."${g.column}"`;
    });
    parts.push(`GROUP BY ${clauses.join(', ')}`);
  }

  if (model.orderBy.length > 0) {
    const clauses = model.orderBy.map((o) => {
      const table = tableById.get(o.tableId)!;
      return `"${table.alias}"."${o.column}" ${o.direction}`;
    });
    parts.push(`ORDER BY ${clauses.join(', ')}`);
  }

  if (model.limit !== null) {
    parts.push(`LIMIT ${model.limit}`);
  }
  return parts.join('\n');
}

/**
 * Validate model invariants before rendering/executing.
 */
export function validateQueryModel(model: IQueryModel): string[] {
  const errors: string[] = [];
  const tableById = new Map(model.tables.map((t) => [t.id, t]));
  if (model.tables.length === 0) {
    errors.push('at least one table is required');
    return errors;
  }
  const aliases = model.tables.map((t) => t.alias);
  if (new Set(aliases).size !== aliases.length) {
    errors.push('table aliases must be unique');
  }
  if (model.limit !== null && (!Number.isInteger(model.limit) || model.limit <= 0)) {
    errors.push('limit must be a positive integer');
  }

  const missingTable = (id: string) => !tableById.has(id);
  for (const join of model.joins) {
    if (missingTable(join.leftTableId) || missingTable(join.rightTableId)) {
      errors.push(`join ${join.id} references unknown table`);
    }
  }
  for (const sel of model.selectedColumns) {
    if (missingTable(sel.tableId)) errors.push(`selected column ${sel.column} references unknown table`);
  }
  for (const filter of model.filters) {
    if (missingTable(filter.tableId)) errors.push(`filter ${filter.id} references unknown table`);
    if (filter.operator === 'IN' && filter.values.length === 0) {
      errors.push(`filter ${filter.id} IN list cannot be empty`);
    }
  }

  const seenJoinKeys = new Set<string>();
  for (const join of model.joins) {
    const key = canonicalJoinKey(join);
    if (seenJoinKeys.has(key)) {
      errors.push(`duplicate join detected (${join.id})`);
    }
    seenJoinKeys.add(key);
  }

  if (model.groupBy.length > 0) {
    const grouped = new Set(model.groupBy.map((g) => `${g.tableId}.${g.column}`));
    for (const sel of model.selectedColumns) {
      if (!sel.aggregation && !grouped.has(`${sel.tableId}.${sel.column}`)) {
        errors.push(`non-aggregated select "${sel.column}" must be in GROUP BY`);
      }
    }
  }
  return errors;
}

/**
 * Escape SQL literal values for SQLite text.
 */
export function sqlLiteral(v: string | number | boolean): string {
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function renderSelectedColumn(
  sel: ISelectedColumn,
  tableById: Map<string, IQueryModel['tables'][number]>,
): string {
  const table = tableById.get(sel.tableId)!;
  const ref = `"${table.alias}"."${sel.column}"`;
  if (!sel.aggregation) return ref;
  const fallbackAlias = `${sel.aggregation.toLowerCase()}_${sel.column}`;
  const alias = sel.alias ?? fallbackAlias;
  return `${sel.aggregation}(${ref}) AS "${alias}"`;
}

function renderJoin(
  join: IQueryJoin,
  tableById: Map<string, IQueryModel['tables'][number]>,
): string {
  const left = tableById.get(join.leftTableId)!;
  const right = tableById.get(join.rightTableId)!;
  return `${join.type} JOIN "${right.baseTable}" AS "${right.alias}" ON "${right.alias}"."${join.rightColumn}" = "${left.alias}"."${join.leftColumn}"`;
}

function canonicalJoinKey(join: IQueryJoin): string {
  const a = `${join.leftTableId}.${join.leftColumn}`;
  const b = `${join.rightTableId}.${join.rightColumn}`;
  return [a, b].sort().join('=');
}
