/**
 * Convert a time-travel {@link ISnapshot} into branch tables (Feature 60 Phase 5 → 37).
 *
 * "Create Branch Here" turns a historical snapshot into a real, persistable data branch so the
 * past state can be diffed, merged-to-SQL, or restored like any other branch. The snapshot store
 * keeps only column NAMES (`string[]`); a branch carries {@link ColumnMetadata}, so we synthesize
 * minimal metadata, marking a column `pk` when it is in the snapshot's captured `pkColumns`. Type
 * is left blank — the snapshot never recorded it, and the branch consumers (diff, merge-SQL) key
 * on column name + pk only, so an empty type is harmless rather than a guess.
 *
 * `sqlite_*` internal tables are excluded, matching live-capture branch semantics. A table whose
 * captured rows were capped (its real `rowCount` exceeds the rows we hold) marks the whole branch
 * `truncated`, so a partial historical branch is never mistaken for a complete one.
 */

import type { ColumnMetadata } from '../api-client';
import type { ISnapshot } from '../timeline/snapshot-types';
import type { IBranchTable } from './branch-types';

export function snapshotToBranchTables(
  snapshot: ISnapshot,
): { tables: IBranchTable[]; truncated: boolean } {
  const tables: IBranchTable[] = [];
  let truncated = false;

  for (const [name, snap] of snapshot.tables) {
    if (name.startsWith('sqlite_')) continue;

    const pkSet = new Set(snap.pkColumns);
    const columns: ColumnMetadata[] = snap.columns.map((col) => ({
      name: col,
      type: '',
      pk: pkSet.has(col),
    }));

    tables.push({
      name,
      columns,
      rows: snap.rows,
      pkColumns: snap.pkColumns,
    });

    // The snapshot store caps rows at ROW_LIMIT; a real rowCount above what we
    // captured means this table is only partially represented in the branch.
    if (snap.rowCount > snap.rows.length) truncated = true;
  }

  return { tables, truncated };
}
