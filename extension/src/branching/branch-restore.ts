/**
 * Branch restore (Feature 37, Phase 4): overwrite the live database with a branch's captured rows.
 *
 * **Deviation from the original plan (intentional, lower-risk).** The plan proposed a dedicated
 * Dart `POST /api/branch/restore` endpoint. Instead, restore reuses the EXISTING server write path
 * (`client.sql()` DELETE/INSERT) that `DataReset` and the dataset importer already rely on — the
 * same path the server gates on its `writeQuery` callback. That avoids new server routing and an
 * extra endpoint for a one-feature need, and inherits the proven write/auth/validation behavior.
 * On a read-only server the writes fail just as `/api/branch/restore` would have returned 501;
 * the caller surfaces that as an error and the diff / merge-SQL paths still work.
 *
 * **FK order.** Tables are cleared children-first and re-inserted parents-first (via
 * {@link DependencySorter}) so foreign keys are never violated mid-restore.
 */

import type { DriftApiClient } from '../api-client';
import type { IDataBranch } from './branch-types';
import { DependencySorter } from '../data-management/dependency-sorter';
import { DataReset } from '../data-management/data-reset';
import { sqlLiteral } from './branch-merge-sql';

export interface IBranchRestoreResult {
  tablesRestored: number;
  rowsInserted: number;
}

/**
 * Replace the live state of every table captured in {@link branch} with the branch's rows.
 * Throws if any write fails (e.g. read-only server) — restore is all-or-nothing from the
 * caller's perspective, though SQLite itself applies statements incrementally.
 */
export async function restoreBranch(
  client: DriftApiClient,
  branch: IDataBranch,
): Promise<IBranchRestoreResult> {
  const tableNames = branch.tables.map((t) => t.name);
  const sorter = new DependencySorter();
  const fks = await new DataReset(client, sorter).getAllFks(tableNames);

  const deleteOrder = sorter.sortForDelete(tableNames, fks);
  const insertOrder = sorter.sortForInsert(tableNames, fks);
  const byName = new Map(branch.tables.map((t) => [t.name, t]));

  // Clear children before parents so deletes never trip a foreign key.
  for (const name of deleteOrder) {
    await client.sql(`DELETE FROM "${name}"`);
  }

  // Re-insert parents before children.
  let rowsInserted = 0;
  for (const name of insertOrder) {
    const table = byName.get(name);
    if (!table) continue;
    for (const row of table.rows) {
      const cols = Object.keys(row);
      const colList = cols.map((c) => `"${c}"`).join(', ');
      const valList = cols.map((c) => sqlLiteral(row[c])).join(', ');
      await client.sql(`INSERT INTO "${name}" (${colList}) VALUES (${valList})`);
      rowsInserted += 1;
    }
  }

  return { tablesRestored: insertOrder.length, rowsInserted };
}
