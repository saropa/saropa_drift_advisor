/**
 * Type definitions for RelationshipEngine (FK traversal and delete planning).
 * Extracted for modularization (plan: under 300 lines per file).
 */

export interface IRelationshipNode {
  table: string;
  column: string;
  pkValue: unknown;
  /** This node's own primary-key column, used to delete its row in FK order. */
  pkColumn: string;
  depth: number;
  children: IRelationshipNode[];
}

export interface IRelationshipChain {
  table: string;
  column: string;
  referencedTable: string;
  referencedColumn: string;
}

export interface IAffectedTable {
  table: string;
  rowCount: number;
  relationship: 'parent' | 'child';
}

export interface IDeletePlan {
  statements: string[];
  affectedTables: IAffectedTable[];
  totalRows: number;
}
