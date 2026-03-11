/**
 * Shared test fixtures for lineage-tracer tests.
 */

import { LineageTracer } from '../lineage/lineage-tracer';

export interface ISqlResult {
  columns: string[];
  rows: unknown[][];
}

export interface IFkResult {
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

export interface ITableMeta {
  name: string;
  columns: { name: string; type: string; pk: boolean }[];
  rowCount: number;
}

/** Build a minimal mock client for testing. */
export function mockClient(opts: {
  tables: ITableMeta[];
  fks: Record<string, IFkResult[]>;
  rows: Record<string, ISqlResult>;
}): InstanceType<typeof LineageTracer> {
  const client = {
    schemaMetadata: async () => opts.tables,
    tableFkMeta: async (name: string) => opts.fks[name] ?? [],
    sql: async (query: string) => {
      for (const [key, val] of Object.entries(opts.rows)) {
        if (query.includes(key)) return val;
      }
      return { columns: [], rows: [] };
    },
  };
  return new LineageTracer(client as never);
}

export function tbl(name: string, pk = 'id'): ITableMeta {
  return {
    name,
    columns: [
      { name: pk, type: 'INTEGER', pk: true },
      { name: 'name', type: 'TEXT', pk: false },
    ],
    rowCount: 1,
  };
}

export function sqlResult(
  columns: string[], ...rows: unknown[][]
): ISqlResult {
  return { columns, rows };
}
