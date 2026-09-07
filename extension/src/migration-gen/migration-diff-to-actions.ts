/**
 * Converts a schema diff result into an ordered list of migration actions.
 */

import { IDartColumn, IDartTable } from '../schema-diff/dart-schema';
import { ColumnMetadata } from '../api-client';
import {
  ISchemaDiffResult,
  ITableColumnDiff,
  ITypeMismatch,
} from '../schema-diff/schema-diff';
import { IColumnDef, IMigrationAction } from './migration-codegen-types';

/**
 * Convert a schema diff result into an ordered list of migration
 * actions. Order: creates, then alters (add/change), then drops.
 */
export function diffToActions(
  diff: ISchemaDiffResult,
): IMigrationAction[] {
  const actions: IMigrationAction[] = [];

  for (const table of diff.tablesOnlyInCode) {
    // Resolve a `primaryKey` getter override to SQL column names up front
    // so generateCreateTable never has to re-derive it from raw Dart
    // getter names (bug 010).
    const pk = resolveTablePrimaryKey(table);
    actions.push({
      type: 'createTable',
      table: table.sqlTableName,
      columns: table.columns.map(dartColToDef),
      primaryKey: pk.names.length > 0 ? pk.names : undefined,
      primaryKeyUnresolved: pk.unresolved || undefined,
    });
  }

  for (const td of diff.tableDiffs) {
    pushTableDiffActions(td, actions);
  }

  for (const table of diff.tablesOnlyInDb) {
    actions.push({ type: 'dropTable', table: table.name });
  }

  return actions;
}

function pushTableDiffActions(
  td: ITableColumnDiff,
  actions: IMigrationAction[],
): void {
  for (const col of td.columnsOnlyInCode) {
    actions.push(addColumnAction(td.tableName, col));
  }
  for (const m of td.typeMismatches) {
    actions.push(changeTypeAction(td.tableName, m));
  }
  for (const col of td.columnsOnlyInDb) {
    actions.push(dropColumnAction(td.tableName, col));
  }
}

/**
 * Resolve a Dart `primaryKey` getter override (Dart getter names, e.g.
 * `['userId', 'groupId']`) to SQL column names for a table-level
 * `PRIMARY KEY (...)` constraint (bug 010).
 *
 * A single `integer().autoIncrement()` column already gets its PRIMARY KEY
 * emitted per-column by dartColToDef/generateCreateTable — the only form
 * SQLite accepts for a rowid-alias AUTOINCREMENT column — so when any
 * column is autoIncrement, skip the table-level constraint entirely rather
 * than risk emitting PRIMARY KEY twice.
 *
 * `unresolved: true` means a name in `primaryKey` could not be matched to a
 * parsed column (e.g. it references a column contributed by a mixin the
 * regex parser can't see). The caller must surface that instead of
 * dropping it silently, which would reproduce this exact bug under a
 * different cause.
 */
function resolveTablePrimaryKey(
  table: IDartTable,
): { names: string[]; unresolved: boolean } {
  if (!table.primaryKey || table.primaryKey.length === 0) {
    return { names: [], unresolved: false };
  }
  if (table.columns.some((c) => c.autoIncrement)) {
    return { names: [], unresolved: false };
  }

  const names: string[] = [];
  let unresolved = false;
  for (const dartName of table.primaryKey) {
    const col = table.columns.find((c) => c.dartName === dartName);
    if (col) {
      names.push(col.sqlName);
    } else {
      unresolved = true;
    }
  }
  // A partial constraint (missing one of the declared key columns) is worse
  // than no constraint at all — it would enforce uniqueness on the wrong
  // set of columns instead of just omitting the check. Drop the partial
  // list so the caller emits only the TODO warning.
  if (unresolved) {
    return { names: [], unresolved: true };
  }
  return { names, unresolved };
}

function dartColToDef(c: IDartColumn): IColumnDef {
  return {
    name: c.sqlName,
    sqlType: c.sqlType,
    pk: c.autoIncrement,
    nullable: c.nullable,
    autoIncrement: c.autoIncrement,
  };
}

function addColumnAction(
  table: string,
  col: IDartColumn,
): IMigrationAction {
  return {
    type: 'addColumn',
    table,
    column: col.sqlName,
    newType: col.sqlType,
    nullable: col.nullable,
  };
}

function changeTypeAction(
  table: string,
  m: ITypeMismatch,
): IMigrationAction {
  return {
    type: 'changeType',
    table,
    column: m.columnName,
    oldType: m.dbType,
    newType: m.codeType,
  };
}

function dropColumnAction(
  table: string,
  col: ColumnMetadata,
): IMigrationAction {
  return {
    type: 'dropColumn',
    table,
    column: col.name,
  };
}
