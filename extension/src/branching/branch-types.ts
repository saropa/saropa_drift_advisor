/**
 * Shared types for Git-style Data Branching (Feature 37).
 *
 * A branch is a full point-in-time capture of every user table's rows. Branches are diffed
 * against the live database or against each other (PK-keyed), and a diff is turned into
 * differential SQL (forward merge or rollback) or applied as a restore.
 */

import type { ColumnMetadata } from '../api-client';

/** One table's captured rows inside a branch. */
export interface IBranchTable {
  name: string;
  columns: ColumnMetadata[];
  rows: Record<string, unknown>[];
  /** Primary-key column names; empty when the table has no declared PK (falls back to full-row identity). */
  pkColumns: string[];
}

/** A named, full-database capture. */
export interface IDataBranch {
  id: string;
  name: string;
  /** ISO-8601 capture time. */
  createdAt: string;
  description?: string;
  tables: IBranchTable[];
  metadata: {
    tableCount: number;
    totalRows: number;
    /** True when at least one table was truncated to the row cap during capture. */
    truncated: boolean;
  };
}

/** One column's value change within a row. */
export interface IRowChange {
  column: string;
  oldValue: unknown;
  newValue: unknown;
}

/** A row present in both sides of a diff with differing non-PK values. */
export interface IRowUpdate {
  /** Stable key string built from the PK columns (or full-row signature when no PK). */
  pk: string;
  /** The PK column→value map, used to build a WHERE clause for UPDATE/DELETE. */
  pkValues: Record<string, unknown>;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  changes: IRowChange[];
}

/** Per-table row-level diff between two branch states (A → B). */
export interface ITableBranchDiff {
  table: string;
  columns: string[];
  pkColumns: string[];
  /** Rows in B not in A. */
  inserts: Record<string, unknown>[];
  /** Rows in both, differing. */
  updates: IRowUpdate[];
  /** Rows in A not in B. */
  deletes: Record<string, unknown>[];
}

/** Full diff between two branch states. */
export interface IBranchDiff {
  branchA: string;
  branchB: string;
  tableDiffs: ITableBranchDiff[];
  summary: {
    inserts: number;
    updates: number;
    deletes: number;
    tablesChanged: number;
  };
}
