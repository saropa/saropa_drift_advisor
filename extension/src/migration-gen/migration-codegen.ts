/**
 * Generates Drift migration Dart code from a schema diff result.
 * Produces `customStatement()` calls for each detected change.
 */

import { IDartColumn, IDartTable } from '../schema-diff/dart-schema';
import { ColumnMetadata } from '../api-client';
import {
  ISchemaDiffResult,
  ITableColumnDiff,
  ITypeMismatch,
} from '../schema-diff/schema-diff';

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

/**
 * Generate Dart migration code from a schema diff result.
 * Returns a self-contained Dart source string using
 * `customStatement()` calls inside an `up()` method.
 */
export function generateMigrationDart(
  diff: ISchemaDiffResult,
  fromVersion: number,
  toVersion: number,
): string {
  const actions = diffToActions(diff);
  if (actions.length === 0) return '';

  const lines: string[] = [];

  lines.push("import 'package:drift/drift.dart';");
  lines.push('');
  lines.push(
    `// Migration from schema v${fromVersion} to v${toVersion}`,
  );
  lines.push('// Generated by Saropa Drift Advisor — review before using!');
  lines.push('');

  for (const action of actions) {
    lines.push(...generateAction(action));
    lines.push('');
  }

  return lines.join('\n');
}

function generateAction(action: IMigrationAction): string[] {
  switch (action.type) {
    case 'createTable':
      return generateCreateTable(action);
    case 'dropTable':
      return generateDropTable(action);
    case 'addColumn':
      return generateAddColumn(action);
    case 'dropColumn':
      return generateDropColumn(action);
    case 'changeType':
      return generateTypeChange(action);
  }
}

function generateCreateTable(action: IMigrationAction): string[] {
  const cols = action.columns ?? [];
  // Built without per-index trailing-comma bookkeeping: colLines are joined
  // with ',\n' below, so a table-level PRIMARY KEY constraint can be
  // appended as one more "line" without recomputing which element is last.
  const colLines = cols.map((c) => {
    const parts = [`"${c.name}" ${c.sqlType}`];
    if (c.pk) parts.push('PRIMARY KEY');
    if (c.autoIncrement) parts.push('AUTOINCREMENT');
    if (!c.nullable && !c.pk) parts.push('NOT NULL');
    return `    ${parts.join(' ')}`;
  });

  // A natural/composite primary key (Drift's `primaryKey` getter override,
  // bug 010) must be a table-level constraint — SQLite only allows the
  // per-column `PRIMARY KEY` form for a single INTEGER rowid alias, which
  // dartColToDef already emits via c.pk/c.autoIncrement above.
  if (action.primaryKey && action.primaryKey.length > 0) {
    const quoted = action.primaryKey.map((n) => `"${n}"`).join(', ');
    colLines.push(`    PRIMARY KEY (${quoted})`);
  }

  const header = [`// New table: ${action.table}`];
  // The parser found a `primaryKey` override but couldn't resolve every
  // getter name to a column (e.g. a mixin-contributed column). Emitting a
  // keyless table here would silently reproduce bug 010 under a different
  // cause, so warn instead of guessing.
  if (action.primaryKeyUnresolved) {
    header.push(
      '// TODO: this table declares a `primaryKey` getter override that '
        + 'could not be fully resolved to SQL column names. Review and add '
        + 'PRIMARY KEY manually before using this migration.',
    );
  }

  return [
    ...header,
    "await customStatement('''",
    `  CREATE TABLE "${action.table}" (`,
    colLines.join(',\n'),
    '  )',
    "''');",
  ];
}

/**
 * Pick a SQL default literal that matches the column's own type affinity.
 *
 * SQLite type affinity does NOT coerce `''` (empty string) into a number:
 * an INTEGER/REAL/BLOB column backfilled with `''` on ALTER TABLE ADD COLUMN
 * stores the literal TEXT value in every pre-existing row, and Drift's
 * generated mapper then throws a cast error on the first read (bug 008).
 * Returns `null` when the type is unrecognized so the caller can fall back
 * to "no default" plus a reviewer TODO, rather than guessing wrong.
 */
function defaultLiteralForSqlType(sqlType: string): string | null {
  switch (sqlType.toUpperCase()) {
    case 'TEXT':
      return "''";
    // Drift stores bool as INTEGER 0/1, so BOOLEAN shares INTEGER's default.
    case 'INTEGER':
    case 'BOOLEAN':
      return '0';
    case 'REAL':
      return '0.0';
    // x'' is the empty-blob literal; '' would store TEXT under BLOB affinity.
    case 'BLOB':
      return "x''";
    default:
      return null;
  }
}

function generateAddColumn(action: IMigrationAction): string[] {
  const nullable = action.nullable ?? true;
  // Nullable columns need no default; NULL is already a valid backfill value.
  if (nullable) {
    return [
      `// Added column: ${action.table}.${action.column}`,
      'await customStatement(',
      `  'ALTER TABLE "${action.table}"'`,
      `  ' ADD COLUMN "${action.column}" ${action.newType}',`,
      ');',
    ];
  }

  const sqlType = action.newType ?? '';
  const literal = defaultLiteralForSqlType(sqlType);
  const lines: string[] = [`// Added column: ${action.table}.${action.column}`];

  if (literal === null) {
    // Unknown/ambiguous affinity: emitting a guessed default risks the same
    // silent-corruption bug this fix addresses, so surface it for review
    // instead of picking a value that might not match the real type.
    lines.push(
      `// TODO: unrecognized SQL type "${sqlType}" — no safe default `
        + 'literal is known. Add NOT NULL DEFAULT <value> manually before '
        + 'running this migration.',
    );
    lines.push(
      'await customStatement(',
      `  'ALTER TABLE "${action.table}"'`,
      `  ' ADD COLUMN "${action.column}" ${action.newType} NOT NULL',`,
      ');',
    );
    return lines;
  }

  // The default is a sentinel to satisfy NOT NULL, not a meaningful value —
  // a non-nullable column added to a populated table has no *correct*
  // default, only a survivable one. Flag it per-column so the reviewer
  // (who may only skim the file-level "review before using!" banner) does
  // not miss it.
  lines.push(
    `// TODO: existing rows are backfilled with ${literal} as a sentinel `
      + '— replace with a real value if one applies.',
  );
  lines.push(
    'await customStatement(',
    `  'ALTER TABLE "${action.table}"'`,
    `  ' ADD COLUMN "${action.column}" ${sqlType} NOT NULL `
      + `DEFAULT ${literal}',`,
    ');',
  );
  return lines;
}

function generateDropColumn(action: IMigrationAction): string[] {
  return [
    `// Removed column: ${action.table}.${action.column}`,
    '// Note: SQLite < 3.35 does not support DROP COLUMN.',
    '// Use table recreation if targeting older SQLite versions.',
    'await customStatement(',
    `  'ALTER TABLE "${action.table}"'`,
    `  ' DROP COLUMN "${action.column}"',`,
    ');',
  ];
}

function generateDropTable(action: IMigrationAction): string[] {
  return [
    `// Removed table: ${action.table}`,
    `// WARNING: This will delete all data in "${action.table}"!`,
    `await customStatement('DROP TABLE IF EXISTS "${action.table}"');`,
  ];
}

function generateTypeChange(action: IMigrationAction): string[] {
  const col = action.column ?? '?';
  const old = action.oldType ?? '?';
  const next = action.newType ?? '?';
  return [
    `// Type change: ${action.table}.${col} `
      + `(${old} \u2192 ${next})`,
    '// WARNING: SQLite does not support ALTER COLUMN.',
    '// Manual migration required — recreate the table with the',
    '// new column type and migrate data.',
    '// See https://sqlite.org/lang_altertable.html'
      + '#making_other_kinds_of_table_schema_changes',
  ];
}
