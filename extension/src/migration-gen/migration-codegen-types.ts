/**
 * Shared data model for migration actions derived from a schema diff.
 */

/** A single migration action derived from a schema diff. */
export interface IMigrationAction {
  type:
    | 'createTable'
    | 'dropTable'
    | 'addColumn'
    | 'dropColumn'
    | 'changeType';
  table: string;
  column?: string;
  oldType?: string;
  newType?: string;
  columns?: IColumnDef[];
  nullable?: boolean;
  /**
   * SQL column names for a table-level `PRIMARY KEY (...)` constraint,
   * resolved from a Dart `primaryKey` getter override (bug 010). Only set
   * for `createTable` actions, and only when no column already carries a
   * per-column PK via `autoIncrement` (see resolveTablePrimaryKey).
   */
  primaryKey?: string[];
  /**
   * True when the table declared a `primaryKey` override but one or more
   * of its getter names could not be resolved to a parsed column (e.g. a
   * column contributed by a mixin the regex parser can't see). Surfacing
   * this lets generateCreateTable warn instead of silently emitting a
   * keyless table — the exact failure mode bug 010 reported.
   */
  primaryKeyUnresolved?: boolean;
}

/** Column definition for a CREATE TABLE action. */
export interface IColumnDef {
  name: string;
  sqlType: string;
  pk: boolean;
  nullable: boolean;
  autoIncrement: boolean;
}
