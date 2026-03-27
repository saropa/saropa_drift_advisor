/**
 * Orders pending data-edit operations for safer multi-table applies:
 * DELETE (children first), then UPDATE (cell), then INSERT (parents first),
 * using the same FK graph as import/seed tooling.
 */

import type { IFkContext } from '../data-management/dataset-types';
import { DependencySorter } from '../data-management/dependency-sorter';
import type { PendingChange } from './change-tracker';

/** Directed FK edge: child [fromTable] references parent [toTable]. */
export interface FkEdge {
  fromTable: string;
  toTable: string;
}

function uniqueTables(changes: readonly PendingChange[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of changes) {
    if (!seen.has(c.table)) {
      seen.add(c.table);
      out.push(c.table);
    }
  }
  return out;
}

/**
 * Groups [changes] matching [predicate] and emits them in [tableOrder], then any
 * leftover tables (unknown to the sorter). Preserves relative order within each table.
 */
function changesInTableOrder(
  changes: readonly PendingChange[],
  predicate: (c: PendingChange) => boolean,
  tableOrder: readonly string[],
): PendingChange[] {
  const filtered = changes.filter(predicate);
  const byTable = new Map<string, PendingChange[]>();
  for (const c of filtered) {
    const arr = byTable.get(c.table);
    if (arr) {
      arr.push(c);
    } else {
      byTable.set(c.table, [c]);
    }
  }
  const out: PendingChange[] = [];
  for (const t of tableOrder) {
    removedAppend(t);
  }
  // Copy keys: [removedAppend] deletes entries; iterating a live Map can skip keys.
  for (const t of [...byTable.keys()]) {
    removedAppend(t);
  }
  return out;

  function removedAppend(table: string): void {
    const arr = byTable.get(table);
    if (arr?.length) {
      out.push(...arr);
      byTable.delete(table);
    }
  }
}

/**
 * Returns a new array: deletes (FK child-first), then cell updates (parent-first among
 * related tables), then inserts (parent-first). Falls back sensibly when [fks] is empty.
 */
export function orderPendingChangesForApply(
  changes: readonly PendingChange[],
  fks: readonly FkEdge[],
): PendingChange[] {
  if (changes.length === 0) {
    return [];
  }
  const tables = uniqueTables(changes);
  const fkCtx: IFkContext[] = fks.map((fk) => ({
    fromTable: fk.fromTable,
    toTable: fk.toTable,
  }));
  const sorter = new DependencySorter();
  const deleteTableOrder = sorter.sortForDelete(tables, fkCtx);
  const insertTableOrder = sorter.sortForInsert(tables, fkCtx);

  const deletes = changesInTableOrder(
    changes,
    (c) => c.kind === 'delete',
    deleteTableOrder,
  );
  const cells = changesInTableOrder(
    changes,
    (c) => c.kind === 'cell',
    insertTableOrder,
  );
  const inserts = changesInTableOrder(
    changes,
    (c) => c.kind === 'insert',
    insertTableOrder,
  );

  return [...deletes, ...cells, ...inserts];
}
