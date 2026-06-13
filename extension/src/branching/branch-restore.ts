/**
 * Branch restore (Feature 37, Phase 4): overwrite the live database with a branch's captured rows.
 *
 * **Single transactional batch.** All clears and re-inserts are submitted as ONE statement list to
 * the server's `POST /api/edits/apply` path (via {@link DriftApiClient.applyEditsBatch}), which runs
 * them inside `BEGIN IMMEDIATE … COMMIT` and rolls the whole set back on any failure. The previous
 * implementation issued each DELETE/INSERT through `client.sql()`; that is the read-only `/api/sql`
 * path, which rejects writes — so it never actually restored — and even if it had, a mid-restore
 * failure (a bad row) would have left the database with some tables cleared and others repopulated.
 * The batch path is both functional (gated on the server `writeQuery` callback, returns an error on a
 * read-only server) and atomic.
 *
 * **FK order.** Statements are ordered children-first for the clears and parents-first for the
 * inserts (via {@link DependencySorter}) so foreign keys are never violated within the transaction.
 *
 * **Size bound.** The batch endpoint caps a single apply at 500 statements. A restore that needs more
 * (clears + every captured row) is rejected as a whole rather than applied partially — preserving the
 * all-or-nothing guarantee. Chunking is intentionally NOT used here because separate chunks would be
 * separate transactions and reintroduce the half-restored state this change exists to prevent.
 */

import type { DriftApiClient } from '../api-client';
import type { IDataBranch } from './branch-types';
import { DependencySorter } from '../data-management/dependency-sorter';
import { DataReset } from '../data-management/data-reset';
import { sqlLiteral } from './branch-merge-sql';
import { q } from '../shared-utils';

export interface IBranchRestoreResult {
  tablesRestored: number;
  rowsInserted: number;
}

/**
 * Replace the live state of every table captured in {@link branch} with the branch's rows, in one
 * transaction. Throws if the batch fails (read-only server, oversized batch, or a bad row) — and on
 * failure the live database is left untouched because the server rolls the transaction back.
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

  const statements: string[] = [];

  // Clear children before parents so deletes never trip a foreign key.
  for (const name of deleteOrder) {
    statements.push(`DELETE FROM ${q(name)}`);
  }

  // Re-insert parents before children.
  let rowsInserted = 0;
  for (const name of insertOrder) {
    const table = byName.get(name);
    if (!table) continue;
    for (const row of table.rows) {
      const cols = Object.keys(row);
      const colList = cols.map((c) => q(c)).join(', ');
      const valList = cols.map((c) => sqlLiteral(row[c])).join(', ');
      statements.push(`INSERT INTO ${q(name)} (${colList}) VALUES (${valList})`);
      rowsInserted += 1;
    }
  }

  // One atomic apply: the server wraps the whole list in a transaction and rolls
  // back on any failure, so a restore is all-or-nothing.
  if (statements.length > 0) {
    await client.applyEditsBatch(statements);
  }

  return { tablesRestored: insertOrder.length, rowsInserted };
}
