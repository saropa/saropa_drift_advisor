import type { IDriftDataset } from '../data-management/dataset-types';
import type { ITableSeedResult } from './seeder-types';

/** Convert a JS value to a SQL literal. */
export function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  const s = String(value).replace(/'/g, "''");
  return `'${s}'`;
}

/** Format seed results as INSERT SQL statements. */
export function formatAsSql(results: ITableSeedResult[]): string {
  const lines: string[] = [
    `-- Generated test data (${new Date().toISOString()})`,
    `-- Tables: ${results.map((r) => r.table).join(', ')}`,
    '',
  ];

  for (const { table, rows } of results) {
    lines.push(`-- ${table}: ${rows.length} rows`);
    for (const row of rows) {
      lines.push(buildInsert(table, row));
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** Format seed results as an IDriftDataset JSON object. */
export function formatAsDataset(
  results: ITableSeedResult[],
  name: string,
): IDriftDataset {
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const { table, rows } of results) {
    tables[table] = rows;
  }
  return { $schema: 'drift-dataset/v1', name, tables };
}

function buildInsert(
  table: string,
  row: Record<string, unknown>,
): string {
  const cols = Object.keys(row);
  const vals = cols.map((c) => sqlLiteral(row[c]));
  const colList = cols.map((c) => `"${c}"`).join(', ');
  return `INSERT INTO "${table}" (${colList}) VALUES (${vals.join(', ')});`;
}
