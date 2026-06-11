/**
 * Row-level diff between a stored snapshot and current table data. Uses a
 * primary-key join when PK columns exist (detects added/removed/changed rows),
 * and falls back to a multiset signature comparison when a table has no PK
 * (added/removed only — per-row change tracking needs identity). Also holds the
 * small row-shaping helpers shared with the snapshot store.
 */

import type { IChangedRow, ITableDiff } from './snapshot-types';

/** Convert API row arrays to keyed objects. */
export function rowsToObjects(
  columns: string[],
  rows: unknown[][],
): Record<string, unknown>[] {
  return rows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < columns.length; i++) {
      obj[columns[i]] = row[i];
    }
    return obj;
  });
}

/** Build a stable string key from a row's primary key columns. */
export function pkKey(row: Record<string, unknown>, pkCols: string[]): string {
  return pkCols.map((c) => String(row[c] ?? '')).join('\0');
}

function rowSignature(row: Record<string, unknown>): string {
  return JSON.stringify(row);
}

/** Compute a row-level diff between snapshot and current data. */
export function computeTableDiff(
  tableName: string,
  columns: string[],
  pkColumns: string[],
  snapshotRows: Record<string, unknown>[],
  currentRows: Record<string, unknown>[],
  snapshotRowCount: number,
  currentRowCount: number,
): ITableDiff {
  if (pkColumns.length === 0) {
    return diffBySignature(
      tableName, columns, snapshotRows, currentRows,
      snapshotRowCount, currentRowCount,
    );
  }
  return diffByPk(
    tableName, columns, pkColumns, snapshotRows, currentRows,
    snapshotRowCount, currentRowCount,
  );
}

function diffByPk(
  tableName: string,
  columns: string[],
  pkColumns: string[],
  snapshotRows: Record<string, unknown>[],
  currentRows: Record<string, unknown>[],
  snapshotRowCount: number,
  currentRowCount: number,
): ITableDiff {
  const snapMap = new Map<string, Record<string, unknown>>();
  for (const row of snapshotRows) {
    snapMap.set(pkKey(row, pkColumns), row);
  }

  const addedRows: Record<string, unknown>[] = [];
  const changedRows: IChangedRow[] = [];
  const matchedKeys = new Set<string>();

  for (const row of currentRows) {
    const key = pkKey(row, pkColumns);
    const snapRow = snapMap.get(key);
    if (!snapRow) {
      addedRows.push(row);
      continue;
    }
    matchedKeys.add(key);
    const changed = columns.filter(
      (c) => JSON.stringify(snapRow[c]) !== JSON.stringify(row[c]),
    );
    if (changed.length > 0) {
      changedRows.push({
        pkValue: key,
        before: snapRow,
        after: row,
        changedColumns: changed,
      });
    }
  }

  const removedRows: Record<string, unknown>[] = [];
  for (const row of snapshotRows) {
    if (!matchedKeys.has(pkKey(row, pkColumns))) {
      removedRows.push(row);
    }
  }

  return {
    tableName, columns, addedRows, removedRows, changedRows,
    snapshotRowCount, currentRowCount,
  };
}

function diffBySignature(
  tableName: string,
  columns: string[],
  snapshotRows: Record<string, unknown>[],
  currentRows: Record<string, unknown>[],
  snapshotRowCount: number,
  currentRowCount: number,
): ITableDiff {
  const snapSigs = new Map<string, number>();
  for (const row of snapshotRows) {
    const sig = rowSignature(row);
    snapSigs.set(sig, (snapSigs.get(sig) ?? 0) + 1);
  }

  const addedRows: Record<string, unknown>[] = [];
  for (const row of currentRows) {
    const sig = rowSignature(row);
    const count = snapSigs.get(sig) ?? 0;
    if (count > 0) {
      snapSigs.set(sig, count - 1);
    } else {
      addedRows.push(row);
    }
  }

  const curSigs = new Map<string, number>();
  for (const row of currentRows) {
    const sig = rowSignature(row);
    curSigs.set(sig, (curSigs.get(sig) ?? 0) + 1);
  }

  const removedRows: Record<string, unknown>[] = [];
  for (const row of snapshotRows) {
    const sig = rowSignature(row);
    const count = curSigs.get(sig) ?? 0;
    if (count > 0) {
      curSigs.set(sig, count - 1);
    } else {
      removedRows.push(row);
    }
  }

  return {
    tableName, columns, addedRows, removedRows, changedRows: [],
    snapshotRowCount, currentRowCount,
  };
}
