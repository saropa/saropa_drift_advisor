/**
 * Shared utilities for ER Diagram feature.
 */

import type { DriftApiClient } from '../api-client';
import type { IFkContext } from './er-diagram-types';

/**
 * Fetch all foreign key relationships in parallel for performance.
 * Skips SQLite internal tables.
 */
export async function fetchAllFks(
  client: DriftApiClient,
  tableNames: string[],
): Promise<IFkContext[]> {
  const filteredTables = tableNames.filter((t) => !t.startsWith('sqlite_'));

  // Fetch FK metadata in parallel for better performance
  const results = await Promise.allSettled(
    filteredTables.map(async (table) => {
      const fks = await client.tableFkMeta(table);
      return fks.map((fk) => ({
        fromTable: table,
        fromColumn: fk.fromColumn,
        toTable: fk.toTable,
        toColumn: fk.toColumn,
      }));
    }),
  );

  // Collect successful results, ignoring failures
  const allFks: IFkContext[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allFks.push(...result.value);
    }
  }
  return allFks;
}
