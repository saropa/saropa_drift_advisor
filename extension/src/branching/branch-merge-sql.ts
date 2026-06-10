/**
 * Branch merge-SQL generator (Feature 37, Phase 3): turn a branch diff into differential SQL.
 *
 * Two directions:
 *   - `forward`  — apply B's changes onto A (insert B-only rows, update changed rows to B's
 *                  values, delete A-only rows).
 *   - `rollback` — undo them (delete B-only rows, restore changed rows to A's values, re-insert
 *                  A-only rows).
 *
 * **FK safety.** Deletes must hit child tables before parents, inserts parents before children.
 * The caller passes the FK-ordered table sequence (from {@link DependencySorter}); this module
 * emits inserts in that order and deletes in reverse, so a forward merge does deletes-first
 * (reverse order) then inserts (forward order) — never violating a foreign key mid-script.
 */

import type { IBranchDiff, ITableBranchDiff, IRowUpdate } from './branch-types';

/** Convert a JS value to a SQLite literal. Mirrors the dataset-import escaping rules. */
export function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function insertSql(table: string, row: Record<string, unknown>): string {
  const cols = Object.keys(row);
  const colList = cols.map((c) => `"${c}"`).join(', ');
  const valList = cols.map((c) => sqlLiteral(row[c])).join(', ');
  return `INSERT INTO "${table}" (${colList}) VALUES (${valList});`;
}

/** WHERE clause from a row's PK values (every column when there is no PK). */
function whereFromPk(pkValues: Record<string, unknown>): string {
  const parts = Object.entries(pkValues).map(([c, v]) =>
    v === null || v === undefined ? `"${c}" IS NULL` : `"${c}" = ${sqlLiteral(v)}`,
  );
  return parts.join(' AND ');
}

function deleteSql(table: string, pkValues: Record<string, unknown>): string {
  return `DELETE FROM "${table}" WHERE ${whereFromPk(pkValues)};`;
}

function updateSql(
  table: string,
  upd: IRowUpdate,
  direction: 'forward' | 'rollback',
): string {
  const setParts = upd.changes.map((ch) => {
    const value = direction === 'forward' ? ch.newValue : ch.oldValue;
    return `"${ch.column}" = ${sqlLiteral(value)}`;
  });
  return `UPDATE "${table}" SET ${setParts.join(', ')} WHERE ${whereFromPk(upd.pkValues)};`;
}

/** Map a table name to its diff for quick lookup in FK-ordered emission. */
function indexByTable(diffs: ITableBranchDiff[]): Map<string, ITableBranchDiff> {
  return new Map(diffs.map((d) => [d.table, d]));
}

/**
 * Generate the differential SQL.
 *
 * @param diff           the branch diff (A → B)
 * @param direction      `forward` applies B onto A; `rollback` undoes it
 * @param insertOrder    FK-safe parent-first table order (deletes run in reverse)
 */
export function generateMergeSql(
  diff: IBranchDiff,
  direction: 'forward' | 'rollback',
  insertOrder: string[],
): string {
  const byTable = indexByTable(diff.tableDiffs);
  const changedInOrder = insertOrder.filter((t) => byTable.has(t));
  // Any changed table missing from insertOrder (e.g. caller passed a partial order) still ships,
  // appended after the ordered ones, so no diff is silently dropped.
  for (const d of diff.tableDiffs) {
    if (!changedInOrder.includes(d.table)) changedInOrder.push(d.table);
  }
  const deleteOrder = [...changedInOrder].reverse();

  const lines: string[] = [
    `-- ${direction === 'forward' ? 'Merge' : 'Rollback'}: ${diff.branchA} -> ${diff.branchB}`,
    `-- ${diff.summary.inserts} insert(s), ${diff.summary.updates} update(s), ${diff.summary.deletes} delete(s) across ${diff.summary.tablesChanged} table(s)`,
    '',
  ];

  // Deletes first (child→parent) so a forward merge never orphans a FK; inserts last (parent→child).
  // Forward delete = rows only in A; rollback delete = rows only in B (the forward inserts), undone.
  emitDeletes(lines, deleteOrder, byTable, direction);
  emitUpdates(lines, changedInOrder, byTable, direction);
  emitInserts(lines, changedInOrder, byTable, direction);

  if (diff.summary.inserts + diff.summary.updates + diff.summary.deletes === 0) {
    lines.push('-- No differences — nothing to apply.');
  }

  return lines.join('\n');
}

function emitDeletes(
  lines: string[],
  order: string[],
  byTable: Map<string, ITableBranchDiff>,
  direction: 'forward' | 'rollback',
): void {
  for (const table of order) {
    const d = byTable.get(table);
    if (!d) continue;
    if (direction === 'forward') {
      // Remove rows present only in A (gone in B).
      for (const row of d.deletes) {
        lines.push(deleteSql(table, pkValuesFromRow(row, d)));
      }
    } else {
      // Rollback: remove rows the forward merge inserted (present only in B).
      for (const row of d.inserts) {
        lines.push(deleteSql(table, pkValuesFromRow(row, d)));
      }
    }
  }
}

function emitUpdates(
  lines: string[],
  order: string[],
  byTable: Map<string, ITableBranchDiff>,
  direction: 'forward' | 'rollback',
): void {
  for (const table of order) {
    const d = byTable.get(table);
    if (!d) continue;
    for (const upd of d.updates) lines.push(updateSql(table, upd, direction));
  }
}

function emitInserts(
  lines: string[],
  order: string[],
  byTable: Map<string, ITableBranchDiff>,
  direction: 'forward' | 'rollback',
): void {
  for (const table of order) {
    const d = byTable.get(table);
    if (!d) continue;
    if (direction === 'forward') {
      for (const row of d.inserts) lines.push(insertSql(table, row));
    } else {
      // Rollback: re-insert rows the forward merge deleted (present only in A).
      for (const row of d.deletes) lines.push(insertSql(table, row));
    }
  }
}

/** Build PK values for a raw row using the table diff's PK columns (all columns when no PK). */
function pkValuesFromRow(
  row: Record<string, unknown>,
  d: ITableBranchDiff,
): Record<string, unknown> {
  const keyCols = d.pkColumns.length > 0 ? d.pkColumns : d.columns;
  const out: Record<string, unknown> = {};
  for (const c of keyCols) out[c] = row[c];
  return out;
}
