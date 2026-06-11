/**
 * Shared data shapes for the timeline snapshot store and its row-diff logic.
 * Extracted from snapshot-store.ts so the diff module and the store can share
 * them without an import cycle; re-exported from snapshot-store.ts for callers.
 */

/** A single point-in-time capture of one table's data. */
export interface ISnapshotTable {
  rowCount: number;
  columns: string[];
  pkColumns: string[];
  rows: Record<string, unknown>[];
}

/** A full snapshot across all tables. */
export interface ISnapshot {
  id: string;
  timestamp: number;
  tables: Map<string, ISnapshotTable>;
}

/** Row-level diff result for a single table. */
export interface ITableDiff {
  tableName: string;
  columns: string[];
  addedRows: Record<string, unknown>[];
  removedRows: Record<string, unknown>[];
  changedRows: IChangedRow[];
  snapshotRowCount: number;
  currentRowCount: number;
}

/** A row present in both snapshot and current with differing values. */
export interface IChangedRow {
  pkValue: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  changedColumns: string[];
}
