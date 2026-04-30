/**
 * Shared SQL rendering and validation for the web multi-table query builder.
 * Mirrors extension `sql-renderer.ts` / `query-model.ts` invariants so preview
 * and `/api/sql` execution stay aligned with the VS Code Visual Query Builder.
 */

/** @typedef {{ id: string; baseTable: string; alias: string; columns: Array<{ name: string; type?: string; pk?: boolean }> }} QbTable */
/** @typedef {{ id: string; leftTableId: string; leftColumn: string; rightTableId: string; rightColumn: string; type: 'INNER'|'LEFT'|'RIGHT' }} QbJoin */
/** @typedef {{ tableId: string; column: string; aggregation?: string; alias?: string }} QbSelCol */
/** @typedef {{ id: string; tableId: string; column: string; operator: string; value?: string|number|boolean; values?: Array<string|number|boolean>; conjunction?: string }} QbFilter */
/** @typedef {{ tableId: string; column: string }} QbGroupCol */
/** @typedef {{ tableId: string; column: string; direction: 'ASC'|'DESC' }} QbOrderCol */
/** @typedef {{ modelVersion: 1; tables: QbTable[]; joins: QbJoin[]; selectedColumns: QbSelCol[]; filters: QbFilter[]; groupBy: QbGroupCol[]; orderBy: QbOrderCol[]; limit: number|null }} QbModel */

function filterHasValue(f: { operator?: string; value?: unknown }): boolean {
  return 'value' in f;
}

function sqlLiteral(v: string | number | boolean): string {
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function canonicalJoinKey(join: { leftTableId: string; leftColumn: string; rightTableId: string; rightColumn: string }): string {
  const a = `${join.leftTableId}.${join.leftColumn}`;
  const b = `${join.rightTableId}.${join.rightColumn}`;
  return [a, b].sort().join('=');
}

function renderSelectedColumn(
  sel: { tableId: string; column: string; aggregation?: string; alias?: string },
  tableById: Map<string, { alias: string; baseTable: string }>,
): string {
  const table = tableById.get(sel.tableId);
  if (!table) throw new Error('missing table for select');
  const ref = `"${table.alias}"."${sel.column}"`;
  if (!sel.aggregation) return ref;
  const fn = String(sel.aggregation).toUpperCase();
  const fallbackAlias = `${fn.toLowerCase()}_${sel.column}`;
  const alias = sel.alias ?? fallbackAlias;
  return `${fn}(${ref}) AS "${alias}"`;
}

function renderJoin(
  join: { type: string; leftTableId: string; leftColumn: string; rightTableId: string; rightColumn: string },
  tableById: Map<string, { alias: string; baseTable: string }>,
): string {
  const left = tableById.get(join.leftTableId);
  const right = tableById.get(join.rightTableId);
  if (!left || !right) throw new Error('join references unknown table');
  const jt = join.type === 'LEFT' || join.type === 'RIGHT' || join.type === 'INNER' ? join.type : 'INNER';
  return `${jt} JOIN "${right.baseTable}" AS "${right.alias}" ON "${right.alias}"."${join.rightColumn}" = "${left.alias}"."${join.leftColumn}"`;
}

/**
 * Validate [model] before render. Returns human-readable errors (empty if OK).
 */
export function validateQueryModel(model: {
  tables: Array<{ id: string; alias: string }>;
  joins: Array<{ id: string; leftTableId: string; leftColumn: string; rightTableId: string; rightColumn: string }>;
  selectedColumns: Array<{ tableId: string; column: string; aggregation?: string }>;
  filters: Array<{ id: string; tableId: string; operator: string; values?: unknown[] }>;
  groupBy: Array<{ tableId: string; column: string }>;
  limit: number | null;
}): string[] {
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
  if (model.limit !== null && (!Number.isInteger(model.limit) || (model.limit as number) <= 0)) {
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
    if (filter.operator === 'IN' && (!('values' in filter) || !filter.values || filter.values.length === 0)) {
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
  // Multi-table: every instance must be reachable from the root via joins (linear JOIN chain).
  if (model.tables.length > 1) {
    const rootId = model.tables[0]!.id;
    const reachable = new Set<string>([rootId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const j of model.joins) {
        if (reachable.has(j.leftTableId) && !reachable.has(j.rightTableId)) {
          reachable.add(j.rightTableId);
          grew = true;
        }
        if (reachable.has(j.rightTableId) && !reachable.has(j.leftTableId)) {
          reachable.add(j.leftTableId);
          grew = true;
        }
      }
    }
    for (const t of model.tables) {
      if (!reachable.has(t.id)) {
        errors.push(`table "${t.alias}" is not connected to the query root via JOINs`);
      }
    }
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
 * Render deterministic SQLite [SELECT] text from [model], or throw with validation message.
 */
export function renderQuerySql(model: {
  tables: Array<{ id: string; baseTable: string; alias: string; columns: Array<{ name: string }> }>;
  joins: Array<{ id: string; type: string; leftTableId: string; leftColumn: string; rightTableId: string; rightColumn: string }>;
  selectedColumns: Array<{ tableId: string; column: string; aggregation?: string; alias?: string }>;
  filters: Array<{
    id: string;
    tableId: string;
    column: string;
    operator: string;
    value?: string | number | boolean;
    values?: Array<string | number | boolean>;
    conjunction?: string;
  }>;
  groupBy: Array<{ tableId: string; column: string }>;
  orderBy: Array<{ tableId: string; column: string; direction: string }>;
  limit: number | null;
}): string {
  const errors = validateQueryModel(model);
  if (errors.length > 0) {
    throw new Error(`Invalid query model: ${errors.join('; ')}`);
  }
  const tableById = new Map(model.tables.map((t) => [t.id, t]));
  const parts: string[] = [];

  const selectCols = model.selectedColumns.map((c) => renderSelectedColumn(c, tableById));
  parts.push(`SELECT ${selectCols.length > 0 ? selectCols.join(', ') : '*'}`);

  const root = model.tables[0]!;
  parts.push(`FROM "${root.baseTable}" AS "${root.alias}"`);

  for (const join of model.joins) {
    parts.push(renderJoin(join, tableById));
  }

  if (model.filters.length > 0) {
    const where = model.filters.map((f, i) => {
      const table = tableById.get(f.tableId)!;
      const ref = `"${table.alias}"."${f.column}"`;
      const prefix = i === 0 ? 'WHERE' : (f.conjunction || 'AND');
      if (f.operator === 'IS NULL' || f.operator === 'IS NOT NULL') {
        return `${prefix} ${ref} ${f.operator}`;
      }
      if (f.operator === 'IN') {
        const vals = f.values || [];
        return `${prefix} ${ref} IN (${vals.map(sqlLiteral).join(', ')})`;
      }
      if (filterHasValue(f)) {
        if (f.operator === 'LIKE') {
          return `${prefix} ${ref} LIKE ${sqlLiteral(f.value as string)}`;
        }
        return `${prefix} ${ref} ${f.operator} ${sqlLiteral(f.value as string | number | boolean)}`;
      }
      throw new Error(`Unexpected filter shape for operator: ${String(f.operator)}`);
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
      const dir = String(o.direction || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      return `"${table.alias}"."${o.column}" ${dir}`;
    });
    parts.push(`ORDER BY ${clauses.join(', ')}`);
  }

  if (model.limit !== null) {
    parts.push(`LIMIT ${model.limit}`);
  }
  return parts.join('\n');
}

/** Operator dropdown options for a column type (aligned with web single-table builder). */
export function getWhereOpsForType(columnType: string): Array<{ val: string; label: string }> {
  const type = (columnType || '').toUpperCase();
  if (type === 'TEXT' || type.indexOf('VARCHAR') >= 0 || type.indexOf('CHAR') >= 0) {
    return [
      { val: 'LIKE', label: 'contains' },
      { val: '=', label: 'equals' },
      { val: '!=', label: '!=' },
      { val: 'IS NULL', label: 'is null' },
      { val: 'IS NOT NULL', label: 'is not null' },
      { val: 'IN', label: 'IN (comma list)' },
    ];
  }
  if (type === 'INTEGER' || type === 'REAL' || type.indexOf('INT') >= 0 || type.indexOf('FLOAT') >= 0 || type.indexOf('DOUBLE') >= 0 || type.indexOf('NUM') >= 0 || type.indexOf('DECIMAL') >= 0) {
    return [
      { val: '=', label: '=' },
      { val: '!=', label: '!=' },
      { val: '>', label: '>' },
      { val: '<', label: '<' },
      { val: '>=', label: '>=' },
      { val: '<=', label: '<=' },
      { val: 'IS NULL', label: 'is null' },
      { val: 'IS NOT NULL', label: 'is not null' },
      { val: 'IN', label: 'IN (comma list)' },
    ];
  }
  if (type === 'BLOB') {
    return [
      { val: 'IS NULL', label: 'is null' },
      { val: 'IS NOT NULL', label: 'is not null' },
    ];
  }
  return [
    { val: '=', label: '=' },
    { val: '!=', label: '!=' },
    { val: 'LIKE', label: 'contains' },
    { val: 'IS NULL', label: 'is null' },
    { val: 'IS NOT NULL', label: 'is not null' },
    { val: 'IN', label: 'IN (comma list)' },
  ];
}
