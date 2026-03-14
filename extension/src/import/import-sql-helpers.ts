/**
 * SQL building and row operations for clipboard import.
 * Extracted from import-executor to keep it under 300 lines.
 * All string values passed to SQL use escapeSqlValue to prevent injection.
 */

import type { DriftApiClient } from '../api-client';

/** Escape single quotes in SQL string values (doubles quotes per SQL standard); prevents injection. */
export function escapeSqlValue(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Find an existing row where match columns equal the given values.
 * Returns row data if found, null otherwise.
 */
export async function findExistingRow(
  client: DriftApiClient,
  table: string,
  row: Record<string, unknown>,
  matchColumns: string[],
): Promise<Record<string, unknown> | null> {
  const conditions = matchColumns
    .filter((col) => row[col] !== null && row[col] !== undefined)
    .map((col) => `"${col}" = '${escapeSqlValue(String(row[col]))}'`)
    .join(' AND ');

  if (!conditions) return null;

  try {
    const result = await client.sql(
      `SELECT * FROM "${table}" WHERE ${conditions} LIMIT 1`,
    );
    if (result.rows.length === 0) return null;

    const existing: Record<string, unknown> = {};
    result.columns.forEach((col, i) => {
      existing[col] = result.rows[0][i];
    });
    return existing;
  } catch {
    return null;
  }
}

/**
 * Insert a row and return the new rowid if the table has a PK column.
 */
export async function insertRow(
  client: DriftApiClient,
  table: string,
  row: Record<string, unknown>,
  pkColumn: string | undefined,
): Promise<string | number | undefined> {
  const columns = Object.keys(row).filter((k) => row[k] !== undefined);
  const values = columns.map((col) => {
    const val = row[col];
    if (val === null) return 'NULL';
    return `'${escapeSqlValue(String(val))}'`;
  });

  const sql = `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${values.join(', ')})`;
  await client.sql(sql);

  if (pkColumn) {
    const lastId = await client.sql('SELECT last_insert_rowid()');
    if (lastId.rows.length > 0) return lastId.rows[0][0] as number;
  }
  return undefined;
}

/**
 * Update an existing row; match columns form the WHERE clause.
 */
export async function updateRow(
  client: DriftApiClient,
  table: string,
  row: Record<string, unknown>,
  matchColumns: string[],
): Promise<void> {
  const setClauses = Object.entries(row)
    .filter(([col]) => !matchColumns.includes(col))
    .map(([col, val]) => {
      if (val === null || val === undefined) return `"${col}" = NULL`;
      return `"${col}" = '${escapeSqlValue(String(val))}'`;
    })
    .join(', ');

  const conditions = matchColumns
    .map((col) => `"${col}" = '${escapeSqlValue(String(row[col]))}'`)
    .join(' AND ');

  if (setClauses && conditions) {
    await client.sql(`UPDATE "${table}" SET ${setClauses} WHERE ${conditions}`);
  }
}
