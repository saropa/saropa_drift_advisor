/**
 * Branch diff engine (Feature 37, Phase 2): pure row-level diff between two branch states.
 *
 * Rows are matched on the table's declared primary key (via the shared {@link pkKey} helper),
 * falling back to a full-row JSON signature when a table has no PK — the same identity rule the
 * snapshot stack already uses. A diff is directional: `A → B` reports what changed to turn A's
 * captured state INTO B's, so `inserts` are rows new in B, `deletes` are rows only in A, and
 * `updates` are rows in both whose non-PK columns differ.
 */

import { pkKey } from '../timeline/snapshot-store';
import type {
  IBranchTable,
  IDataBranch,
  IBranchDiff,
  ITableBranchDiff,
  IRowUpdate,
} from './branch-types';

/** Identity key for a row: PK-based when a PK exists, else a full-row signature. */
function rowKey(row: Record<string, unknown>, pkColumns: string[]): string {
  return pkColumns.length > 0 ? pkKey(row, pkColumns) : JSON.stringify(row);
}

/** Extract the PK column→value map for a row (used to build WHERE clauses downstream). */
function pkValuesOf(
  row: Record<string, unknown>,
  pkColumns: string[],
  columns: string[],
): Record<string, unknown> {
  // With no declared PK, fall back to every column so the WHERE clause is still unambiguous.
  const keyCols = pkColumns.length > 0 ? pkColumns : columns;
  const out: Record<string, unknown> = {};
  for (const c of keyCols) out[c] = row[c];
  return out;
}

/**
 * Diff one table's rows, A → B. Both sides may be undefined (table absent in that branch):
 * a table only in A reports all-deletes, a table only in B reports all-inserts.
 */
export function diffTable(
  table: string,
  tableA: IBranchTable | undefined,
  tableB: IBranchTable | undefined,
): ITableBranchDiff {
  const columns = tableB?.columns.map((c) => c.name) ?? tableA?.columns.map((c) => c.name) ?? [];
  const pkColumns =
    (tableB?.pkColumns.length ? tableB.pkColumns : tableA?.pkColumns) ?? [];
  const rowsA = tableA?.rows ?? [];
  const rowsB = tableB?.rows ?? [];

  const mapA = new Map(rowsA.map((r) => [rowKey(r, pkColumns), r]));
  const mapB = new Map(rowsB.map((r) => [rowKey(r, pkColumns), r]));

  const inserts: Record<string, unknown>[] = [];
  const deletes: Record<string, unknown>[] = [];
  const updates: IRowUpdate[] = [];

  for (const [key, rowB] of mapB) {
    const rowA = mapA.get(key);
    if (!rowA) {
      inserts.push(rowB);
      continue;
    }
    const changes = columns
      .filter((c) => JSON.stringify(rowA[c]) !== JSON.stringify(rowB[c]))
      .map((c) => ({ column: c, oldValue: rowA[c], newValue: rowB[c] }));
    if (changes.length > 0) {
      updates.push({
        pk: key,
        pkValues: pkValuesOf(rowB, pkColumns, columns),
        before: rowA,
        after: rowB,
        changes,
      });
    }
  }

  for (const [key, rowA] of mapA) {
    if (!mapB.has(key)) deletes.push(rowA);
  }

  return { table, columns, pkColumns, inserts, updates, deletes };
}

/** Build the table list as the union of both branches' tables, preserving A's order then B-only. */
function unionTableNames(a: IDataBranch, b: IDataBranch): string[] {
  const names: string[] = a.tables.map((t) => t.name);
  for (const t of b.tables) if (!names.includes(t.name)) names.push(t.name);
  return names;
}

/** Diff branch A against branch B (A → B), keeping only tables that actually changed. */
export function diffBranches(a: IDataBranch, b: IDataBranch): IBranchDiff {
  const byNameA = new Map(a.tables.map((t) => [t.name, t]));
  const byNameB = new Map(b.tables.map((t) => [t.name, t]));

  const tableDiffs: ITableBranchDiff[] = [];
  let inserts = 0;
  let updates = 0;
  let deletes = 0;

  for (const name of unionTableNames(a, b)) {
    const diff = diffTable(name, byNameA.get(name), byNameB.get(name));
    if (diff.inserts.length + diff.updates.length + diff.deletes.length === 0) continue;
    tableDiffs.push(diff);
    inserts += diff.inserts.length;
    updates += diff.updates.length;
    deletes += diff.deletes.length;
  }

  return {
    branchA: a.name,
    branchB: b.name,
    tableDiffs,
    summary: { inserts, updates, deletes, tablesChanged: tableDiffs.length },
  };
}
