import type { DriftApiClient } from '../api-client';
import type { TableMetadata } from '../api-types';
import type { IFkMap, IFkRef } from '../lineage/lineage-types';
import { sqlLiteral } from '../lineage/lineage-tracer';
import { rowsToObjects } from '../timeline/snapshot-store';
import type {
  IImpactBranch, IImpactResult, IImpactRow,
  IImpactSummary, IOutboundRef,
} from './impact-types';

const MAX_PREVIEW_COLS = 5;
const MAX_EXPANDED_ROWS = 10;

/** Analyzes the cascade impact of deleting a specific row. */
export class ImpactAnalyzer {
  constructor(private readonly _client: DriftApiClient) {}

  async analyze(
    table: string,
    pkColumn: string,
    pkValue: unknown,
    maxDepth: number,
  ): Promise<IImpactResult> {
    const tables = await this._client.schemaMetadata();
    const fkMap = await this._buildFkMap(tables);

    const rootRow = await this._fetchRow(table, pkColumn, pkValue);
    const root = {
      table, pkColumn, pkValue,
      preview: rootRow ? preview(rootRow) : {},
    };

    const outbound = rootRow
      ? await this._resolveOutbound(table, rootRow, fkMap)
      : [];

    const inbound = await this._resolveInbound(
      table, pkColumn, pkValue, fkMap, maxDepth, new Set(),
    );

    const summary = computeSummary(inbound);

    return { root, outbound, inbound, summary };
  }

  /** Build bidirectional FK map for quick lookup. */
  private async _buildFkMap(
    tables: TableMetadata[],
  ): Promise<IFkMap> {
    const outgoing = new Map<string, IFkRef[]>();
    const incoming = new Map<string, IFkRef[]>();
    const pkColumns = new Map<string, string>();

    const userTables = tables.filter(
      (t) => !t.name.startsWith('sqlite_'),
    );
    for (const table of userTables) {
      const pkCol = table.columns.find((c) => c.pk)?.name ?? 'rowid';
      pkColumns.set(table.name, pkCol);
    }

    const fkResults = await Promise.all(
      userTables.map(async (t) => ({
        table: t.name,
        fks: await this._client.tableFkMeta(t.name),
      })),
    );

    for (const { table, fks } of fkResults) {
      for (const fk of fks) {
        const ref: IFkRef = {
          fromTable: table,
          fromColumn: fk.fromColumn,
          toTable: fk.toTable,
          toColumn: fk.toColumn,
        };
        pushToMap(outgoing, table, ref);
        pushToMap(incoming, fk.toTable, ref);
      }
    }
    return { outgoing, incoming, pkColumns };
  }

  /** Follow FK columns in the root row to find parent rows. */
  private async _resolveOutbound(
    table: string,
    row: Record<string, unknown>,
    fkMap: IFkMap,
  ): Promise<IOutboundRef[]> {
    const refs: IOutboundRef[] = [];
    const outgoing = fkMap.outgoing.get(table) ?? [];

    for (const fk of outgoing) {
      const fkValue = row[fk.fromColumn];
      if (fkValue === null || fkValue === undefined) continue;

      const parentRow = await this._fetchRow(
        fk.toTable, fk.toColumn, fkValue,
      );
      if (!parentRow) continue;

      refs.push({
        table: fk.toTable,
        pkColumn: fk.toColumn,
        pkValue: fkValue,
        fkColumn: fk.fromColumn,
        preview: preview(parentRow),
      });
    }
    return refs;
  }

  /** Find all rows referencing this PK, grouped by table branch. */
  private async _resolveInbound(
    table: string,
    pkColumn: string,
    pkValue: unknown,
    fkMap: IFkMap,
    depth: number,
    visited: Set<string>,
  ): Promise<IImpactBranch[]> {
    if (depth <= 0) return [];

    const branches: IImpactBranch[] = [];
    const incoming = fkMap.incoming.get(table) ?? [];

    for (const fk of incoming) {
      const totalCount = await this._countChildren(
        fk.fromTable, fk.fromColumn, pkValue,
      );
      if (totalCount === 0) continue;

      const childRows = await this._queryChildren(
        fk.fromTable, fk.fromColumn, pkValue,
      );

      const childPkCol = fkMap.pkColumns.get(fk.fromTable) ?? 'rowid';
      const rows: IImpactRow[] = [];

      for (const r of childRows) {
        const childPk = r[childPkCol];
        const key = `${fk.fromTable}:${childPk}`;
        if (visited.has(key)) continue;
        visited.add(key);

        const children = await this._resolveInbound(
          fk.fromTable, childPkCol, childPk,
          fkMap, depth - 1, visited,
        );

        rows.push({
          pkColumn: childPkCol,
          pkValue: childPk,
          preview: preview(r),
          children,
        });
      }

      branches.push({
        table: fk.fromTable,
        fkColumn: fk.fromColumn,
        totalCount,
        rows,
        truncated: totalCount > rows.length,
      });
    }

    return branches;
  }

  private async _fetchRow(
    table: string, column: string, value: unknown,
  ): Promise<Record<string, unknown> | null> {
    const q = `SELECT * FROM "${table}" WHERE "${column}" = ${sqlLiteral(value)} LIMIT 1`;
    try {
      const result = await this._client.sql(q);
      const rows = rowsToObjects(result.columns, result.rows);
      return rows[0] ?? null;
    } catch {
      return null;
    }
  }

  private async _countChildren(
    table: string, column: string, value: unknown,
  ): Promise<number> {
    const q = `SELECT COUNT(*) AS c FROM "${table}" WHERE "${column}" = ${sqlLiteral(value)}`;
    try {
      const result = await this._client.sql(q);
      const rows = rowsToObjects(result.columns, result.rows);
      const count = rows[0]?.['c'];
      return typeof count === 'number' ? count : 0;
    } catch {
      return 0;
    }
  }

  private async _queryChildren(
    table: string, column: string, value: unknown,
  ): Promise<Record<string, unknown>[]> {
    const q = `SELECT * FROM "${table}" WHERE "${column}" = ${sqlLiteral(value)} LIMIT ${MAX_EXPANDED_ROWS}`;
    try {
      const result = await this._client.sql(q);
      return rowsToObjects(result.columns, result.rows);
    } catch {
      return [];
    }
  }
}

/** Generate DELETE SQL in children-first order from an impact result. */
export function generateImpactDeleteSql(
  result: IImpactResult,
): string {
  const statements: string[] = [];
  const visited = new Set<string>();

  function collectBranches(branches: IImpactBranch[]): void {
    for (const branch of branches) {
      for (const row of branch.rows) {
        collectBranches(row.children);
        const key = `${branch.table}:${row.pkValue}`;
        if (!visited.has(key)) {
          visited.add(key);
          statements.push(
            `DELETE FROM "${branch.table}" WHERE "${row.pkColumn}" = ${sqlLiteral(row.pkValue)};`,
          );
        }
      }
      if (branch.truncated) {
        statements.push(
          `-- NOTE: ${branch.table} has ${branch.totalCount} total rows via ${branch.fkColumn}; only ${branch.rows.length} shown above`,
        );
      }
    }
  }

  collectBranches(result.inbound);

  const rootKey = `${result.root.table}:${result.root.pkValue}`;
  if (!visited.has(rootKey)) {
    statements.push(
      `DELETE FROM "${result.root.table}" WHERE "${result.root.pkColumn}" = ${sqlLiteral(result.root.pkValue)};`,
    );
  }

  return `-- Safe cascade deletion (children first, review before executing!)\n${statements.join('\n')}`;
}

/** Compute aggregate summary from inbound branches. */
export function computeSummary(
  inbound: IImpactBranch[],
): IImpactSummary {
  const counts = new Map<string, number>();

  function walk(branches: IImpactBranch[]): void {
    for (const b of branches) {
      counts.set(b.table, (counts.get(b.table) ?? 0) + b.totalCount);
      for (const row of b.rows) {
        walk(row.children);
      }
    }
  }

  walk(inbound);

  const tables = [...counts.entries()]
    .map(([name, rowCount]) => ({ name, rowCount }))
    .sort((a, b) => b.rowCount - a.rowCount);
  const totalRows = tables.reduce((sum, t) => sum + t.rowCount, 0);
  return { tables, totalRows, totalTables: tables.length };
}

function preview(row: Record<string, unknown>): Record<string, unknown> {
  const keys = Object.keys(row).slice(0, MAX_PREVIEW_COLS);
  return Object.fromEntries(keys.map((k) => [k, row[k]]));
}

function pushToMap(
  map: Map<string, IFkRef[]>, key: string, ref: IFkRef,
): void {
  const list = map.get(key) ?? [];
  list.push(ref);
  map.set(key, list);
}
