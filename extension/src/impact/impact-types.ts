/** A parent row that the root row depends on (outbound FK). */
export interface IOutboundRef {
  table: string;
  pkColumn: string;
  pkValue: unknown;
  /** The FK column in the root table that points to this parent. */
  fkColumn: string;
  /** First few columns of the parent row for display. */
  preview: Record<string, unknown>;
}

/** A group of child rows from one table that reference a parent row. */
export interface IImpactBranch {
  table: string;
  /** The FK column in this child table. */
  fkColumn: string;
  /** Total number of rows referencing the parent (from COUNT query). */
  totalCount: number;
  /** First N rows expanded with their own recursive children. */
  rows: IImpactRow[];
  /** True when totalCount > rows.length. */
  truncated: boolean;
}

/** A single child row within a branch, with optional recursive children. */
export interface IImpactRow {
  pkColumn: string;
  pkValue: unknown;
  preview: Record<string, unknown>;
  /** Recursive: this row's own inbound dependents. */
  children: IImpactBranch[];
}

/** Aggregate summary of cascade delete impact. */
export interface IImpactSummary {
  tables: { name: string; rowCount: number }[];
  totalRows: number;
  totalTables: number;
}

/** Top-level result of an impact analysis. */
export interface IImpactResult {
  /** The root row being analyzed. */
  root: {
    table: string;
    pkColumn: string;
    pkValue: unknown;
    preview: Record<string, unknown>;
  };
  /** Rows this row depends on (parents via outbound FKs). */
  outbound: IOutboundRef[];
  /** Grouped branches of rows that depend on this row (inbound FKs). */
  inbound: IImpactBranch[];
  /** Aggregate summary of cascade delete impact. */
  summary: IImpactSummary;
}
