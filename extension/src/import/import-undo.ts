/**
 * Undo import: reverse inserts (DELETE) and updates (restore previous values).
 * Used by ImportExecutor and clipboard import panel.
 */

import type { DriftApiClient } from '../api-client';
import type { IUpdatedRow } from './clipboard-import-types';

/** Escape single quotes for SQL string values. */
function escapeSqlValue(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Undo a previous import by deleting inserted rows and restoring updated rows.
 * Wraps operations in a transaction; rolls back on failure.
 *
 * @param client - API client for database operations
 * @param table - Table where import was performed
 * @param insertedIds - IDs of rows that were inserted
 * @param updatedRows - Updated rows with their previous values
 * @param pkColumn - Primary key column name for WHERE clauses
 * @returns Success status and error message if failed
 */
export async function undoImport(
  client: DriftApiClient,
  table: string,
  insertedIds: (string | number)[],
  updatedRows: IUpdatedRow[],
  pkColumn: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await client.sql('BEGIN TRANSACTION');

    for (const id of insertedIds) {
      await client.sql(
        `DELETE FROM "${table}" WHERE "${pkColumn}" = '${escapeSqlValue(String(id))}'`,
      );
    }

    for (const update of updatedRows) {
      const setClauses = Object.entries(update.previousValues)
        .filter(([col]) => col !== pkColumn)
        .map(([col, val]) => {
          if (val === null || val === undefined) {
            return `"${col}" = NULL`;
          }
          return `"${col}" = '${escapeSqlValue(String(val))}'`;
        })
        .join(', ');

      if (setClauses) {
        await client.sql(
          `UPDATE "${table}" SET ${setClauses} WHERE "${pkColumn}" = '${escapeSqlValue(String(update.id))}'`,
        );
      }
    }

    await client.sql('COMMIT');
    return { success: true };
  } catch (err) {
    try {
      await client.sql('ROLLBACK');
    } catch {
      // Ignore rollback errors
    }

    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
