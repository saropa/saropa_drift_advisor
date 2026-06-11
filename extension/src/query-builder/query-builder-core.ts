/**
 * Single source of truth for the visual query builder's SQL semantics
 * (Feature 21, Phase 1): SQL rendering, model validation, literal escaping, and
 * per-type WHERE operator lists.
 *
 * This module is intentionally self-contained — it imports nothing, so it can be
 * compiled into BOTH the VS Code extension (tsc) and the debug web bundle
 * (esbuild) without dragging in `api-client`/`vscode`. The extension's
 * `sql-renderer.ts` and the web's `query-builder-sql.ts` both re-export from here
 * instead of keeping hand-synced copies that could silently diverge and emit
 * different SQL for the same model.
 *
 * Parameter types are the structural minimum the renderer/validator read, so the
 * extension's strict `IQueryModel` (with canvas `position`, discriminated filter
 * union) and the web's looser `WebQbModel` are both assignable without casts.
 */

export interface CoreColumn {
  name: string;
  type?: string;
  pk?: boolean;
}

export interface CoreTable {
  id: string;
  baseTable: string;
  alias: string;
  columns: CoreColumn[];
}

export interface CoreJoin {
  id: string;
  type: string;
  leftTableId: string;
  leftColumn: string;
  rightTableId: string;
  rightColumn: string;
}

export interface CoreSelectedColumn {
  tableId: string;
  column: string;
  aggregation?: string;
  alias?: string;
}

export interface CoreFilter {
  id: string;
  tableId: string;
  column: string;
  operator: string;
  value?: string | number | boolean;
  values?: Array<string | number | boolean>;
  conjunction?: string;
}

export interface CoreGroupBy {
  tableId: string;
  column: string;
}

export interface CoreOrderBy {
  tableId: string;
  column: string;
  direction: string;
}

export interface CoreModel {
  modelVersion?: number;
  tables: CoreTable[];
  joins: CoreJoin[];
  selectedColumns: CoreSelectedColumn[];
  filters: CoreFilter[];
  groupBy: CoreGroupBy[];
  orderBy: CoreOrderBy[];
  limit: number | null;
}

/** Escape a scalar for SQLite text; non-finite numbers become NULL. */
export function sqlLiteral(v: string | number | boolean): string {
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** Canonical key for a join's endpoints, order-independent (mirrored == duplicate). */
function canonicalJoinKey(join: CoreJoin): string {
  const a = `${join.leftTableId}.${join.leftColumn}`;
  const b = `${join.rightTableId}.${join.rightColumn}`;
  return [a, b].sort().join('=');
}

function renderSelectedColumn(sel: CoreSelectedColumn, tableById: Map<string, CoreTable>): string {
  const table = tableById.get(sel.tableId);
  if (!table) throw new Error('missing table for select');
  const ref = `"${table.alias}"."${sel.column}"`;
  if (!sel.aggregation) return ref;
  const fn = String(sel.aggregation).toUpperCase();
  const alias = sel.alias ?? `${fn.toLowerCase()}_${sel.column}`;
  return `${fn}(${ref}) AS "${alias}"`;
}

function renderJoin(join: CoreJoin, tableById: Map<string, CoreTable>): string {
  const left = tableById.get(join.leftTableId);
  const right = tableById.get(join.rightTableId);
  if (!left || !right) throw new Error('join references unknown table');
  const jt = join.type === 'LEFT' || join.type === 'RIGHT' || join.type === 'INNER' ? join.type : 'INNER';
  return `${jt} JOIN "${right.baseTable}" AS "${right.alias}" ON "${right.alias}"."${join.rightColumn}" = "${left.alias}"."${join.leftColumn}"`;
}

/**
 * Validate model invariants before rendering/executing. Returns human-readable
 * errors (empty when the model is valid and executable).
 */
export function validateQueryModel(model: CoreModel): string[] {
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
    if (filter.operator === 'IN' && (!filter.values || filter.values.length === 0)) {
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

  // Every non-root instance must be reachable from the root via the JOIN graph,
  // else the rendered SQL would emit a table with no ON condition (cross join).
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
 * Render deterministic SQLite `SELECT` text from the model, or throw with the
 * validation message. Determinism keeps preview snapshots and tests stable.
 */
export function renderQuerySql(model: CoreModel): string {
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
      // Scalar comparison or LIKE: both carry a single `value`.
      if ('value' in f && f.value !== undefined) {
        return `${prefix} ${ref} ${f.operator} ${sqlLiteral(f.value)}`;
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
