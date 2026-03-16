/**
 * Generates reverse migration SQL + Dart code from schema timeline changes.
 * Given the diff between two schema snapshots, produces the SQL and Dart
 * `customStatement()` calls needed to undo each change.
 */

import type {
  ISchemaChange,
  ISchemaSnapshot,
  ITableSnapshot,
} from '../schema-timeline/schema-timeline-types';

/** Result of generating a rollback for a set of schema changes. */
export interface IRollbackResult {
  /** Individual SQL statements that reverse the forward migration. */
  sql: string[];
  /** Full Dart source with customStatement() calls for each rollback step. */
  dart: string;
  /** Deduplicated user-facing warnings about limitations. */
  warnings: string[];
}

/**
 * Generate rollback SQL + Dart for a set of forward schema changes.
 *
 * @param changes - Schema changes from `diffSchemaSnapshots(before, after)`.
 * @param before - The earlier snapshot (the state we want to revert TO).
 * @param after - The later snapshot (the state we want to revert FROM).
 */
export function generateRollback(
  changes: readonly ISchemaChange[],
  before: ISchemaSnapshot,
  after: ISchemaSnapshot,
): IRollbackResult {
  if (changes.length === 0) {
    return { sql: [], dart: '', warnings: [] };
  }

  const sql: string[] = [];
  const warnings: string[] = [];

  // Build lookup map for the "before" snapshot so we can reconstruct
  // dropped tables or removed columns from their original definitions.
  const beforeTables = new Map(before.tables.map((t) => [t.name, t]));

  // Process changes in reverse order: undo the last change first.
  // Within that, order by type: drops before alters before creates,
  // so that dependent objects are removed before the objects they depend on.
  const ordered = orderForRollback(changes);

  for (const change of ordered) {
    switch (change.type) {
      case 'table_added':
        // Forward added a table → rollback drops it.
        sql.push(`DROP TABLE IF EXISTS "${change.table}";`);
        break;

      case 'table_dropped':
        // Forward dropped a table → rollback re-creates it from the
        // before snapshot. We only have column names, types, and PK info;
        // constraints, defaults, and triggers are not captured in snapshots.
        rollbackTableDrop(change.table, beforeTables, sql, warnings);
        break;

      case 'column_added':
        // Forward added a column → rollback drops it.
        rollbackColumnAdd(change, sql, warnings);
        break;

      case 'column_removed':
        // Forward removed a column → rollback re-adds it from the before
        // snapshot. Only the column type is available; constraints are lost.
        rollbackColumnRemove(change, beforeTables, sql, warnings);
        break;

      case 'column_type_changed':
        // SQLite does not support ALTER COLUMN. Manual migration required.
        sql.push(
          `-- WARNING: Cannot auto-rollback type change for`
          + ` "${change.table}": ${change.detail}`,
        );
        sql.push(
          '-- Manual table recreation required.'
          + ' See https://sqlite.org/lang_altertable.html',
        );
        warnings.push(
          `Type change on "${change.table}" (${change.detail})`
          + ' cannot be reversed automatically.',
        );
        break;

      case 'fk_added':
        // SQLite does not support ALTER TABLE ADD/DROP CONSTRAINT for FKs.
        // Forward added an FK → we can only document the change.
        sql.push(
          `-- WARNING: Cannot auto-rollback FK addition on`
          + ` "${change.table}": ${change.detail}`,
        );
        sql.push(
          '-- Manual table recreation required to remove FK constraints.',
        );
        warnings.push(
          `FK change on "${change.table}" (${change.detail})`
          + ' cannot be reversed automatically — SQLite does not support'
          + ' ALTER TABLE DROP CONSTRAINT.',
        );
        break;

      case 'fk_removed':
        // Forward removed an FK → re-adding requires table recreation.
        sql.push(
          `-- WARNING: Cannot auto-rollback FK removal on`
          + ` "${change.table}": ${change.detail}`,
        );
        sql.push(
          '-- Manual table recreation required to restore FK constraints.',
        );
        warnings.push(
          `FK change on "${change.table}" (${change.detail})`
          + ' cannot be reversed automatically — SQLite does not support'
          + ' ALTER TABLE ADD CONSTRAINT.',
        );
        break;

      default:
        // Exhaustiveness guard: if a new SchemaChangeType is added
        // without a rollback handler, TypeScript will flag this line.
        change.type satisfies never;
    }
  }

  // Deduplicate warnings (e.g., multiple DROP COLUMN warnings → one SQLite note).
  const uniqueWarnings = [...new Set(warnings)];

  // Generate Dart migration code from the SQL statements.
  const dart = generateDartFromSql(sql, before.generation, after.generation);

  return { sql, dart, warnings: uniqueWarnings };
}

// ---- Rollback helpers ----

/** Re-create a dropped table from the before snapshot's column definitions. */
function rollbackTableDrop(
  table: string,
  beforeTables: Map<string, ITableSnapshot>,
  sql: string[],
  warnings: string[],
): void {
  const tableData = beforeTables.get(table);
  if (!tableData || tableData.columns.length === 0) {
    sql.push(`-- Cannot recreate "${table}": no column data in snapshot.`);
    warnings.push(
      `Table "${table}" was dropped but snapshot has no column data`
      + ' to recreate it.',
    );
    return;
  }

  const colDefs = tableData.columns.map((col, i) => {
    const parts = [`    "${col.name}" ${col.type}`];
    if (col.pk) {
      parts.push('PRIMARY KEY');
    }
    const isLast = i === tableData.columns.length - 1;
    return parts.join(' ') + (isLast ? '' : ',');
  });

  sql.push(
    `CREATE TABLE "${table}" (\n${colDefs.join('\n')}\n);`,
  );

  warnings.push(
    `Recreated "${table}" from snapshot data — constraints, defaults,`
    + ' and triggers may be missing. Review before applying.',
  );
}

/** Drop a column that was added in the forward migration. */
function rollbackColumnAdd(
  change: ISchemaChange,
  sql: string[],
  warnings: string[],
): void {
  // Extract column name from detail string: '"colName" (TYPE)'
  const colName = extractColumnName(change.detail);
  if (!colName) {
    sql.push(
      `-- Cannot determine column name from: ${change.detail}`,
    );
    return;
  }

  sql.push(
    `ALTER TABLE "${change.table}" DROP COLUMN "${colName}";`,
  );
  warnings.push(
    'ALTER TABLE DROP COLUMN requires SQLite 3.35.0+ (2021-03-12).'
    + ' Use table recreation if targeting older SQLite versions.',
  );
}

/** Re-add a column that was removed in the forward migration. */
function rollbackColumnRemove(
  change: ISchemaChange,
  beforeTables: Map<string, ITableSnapshot>,
  sql: string[],
  warnings: string[],
): void {
  // Extract column name from detail string: '"colName"'
  const colName = extractColumnName(change.detail);
  if (!colName) {
    sql.push(
      `-- Cannot determine column name from: ${change.detail}`,
    );
    return;
  }

  // Look up the column type from the before snapshot.
  const tableData = beforeTables.get(change.table);
  const colInfo = tableData?.columns.find((c) => c.name === colName);
  const colType = colInfo?.type ?? 'TEXT';

  sql.push(
    `ALTER TABLE "${change.table}" ADD COLUMN "${colName}" ${colType};`,
  );

  if (!colInfo) {
    warnings.push(
      `Column "${colName}" type not found in snapshot —`
      + ' defaulted to TEXT. Review before applying.',
    );
  }
}

// ---- Utility functions ----

/**
 * Extract the column name from a schema change detail string.
 * Detail formats: '"colName" (TYPE)' or '"colName"'.
 */
export function extractColumnName(detail: string): string | null {
  const match = detail.match(/"([^"]+)"/);
  return match ? match[1] : null;
}

/**
 * Order changes for rollback execution. Reversals should be applied
 * in the opposite order of the forward migration:
 * 1. Drop added tables/columns first (reverse of create-then-alter)
 * 2. Recreate dropped columns/tables last (reverse of alter-then-drop)
 *
 * Within each group, process in reverse array order.
 */
function orderForRollback(
  changes: readonly ISchemaChange[],
): ISchemaChange[] {
  // Assign priority: lower number = execute first in rollback.
  // Forward order was: create tables → add columns → change types → drop columns → drop tables.
  // Rollback order is: drop added tables → drop added columns → (warnings) → add removed columns → recreate dropped tables.
  const priority: Record<string, number> = {
    table_added: 0,       // rollback = DROP TABLE (do first)
    column_added: 1,      // rollback = DROP COLUMN
    column_type_changed: 2, // rollback = warning
    fk_added: 3,          // rollback = warning
    fk_removed: 4,        // rollback = warning
    column_removed: 5,    // rollback = ADD COLUMN
    table_dropped: 6,     // rollback = CREATE TABLE (do last)
  };

  // Copy and sort by priority, then reverse array index for tie-breaking
  // (later changes in the forward list should be undone first).
  return [...changes].sort((a, b) => {
    const pa = priority[a.type] ?? 99;
    const pb = priority[b.type] ?? 99;
    return pa - pb;
  });
}

/**
 * Generate a Dart migration source string from rollback SQL statements.
 * Follows the same format as migration-codegen.ts generateMigrationDart().
 */
function generateDartFromSql(
  sql: string[],
  fromGeneration: number,
  toGeneration: number,
): string {
  // Filter out comment-only lines (warnings) — they become Dart comments.
  const lines: string[] = [];

  lines.push("import 'package:drift/drift.dart';");
  lines.push('');
  lines.push(
    `// Rollback migration: undo schema changes from`
    + ` generation ${fromGeneration} to ${toGeneration}`,
  );
  lines.push('// Generated by Saropa Drift Advisor — review before using!');
  lines.push('');

  for (const stmt of sql) {
    if (stmt.startsWith('--')) {
      // Convert SQL comments to Dart comments.
      lines.push(`// ${stmt.slice(3).trim()}`);
    } else if (stmt.includes('\n')) {
      // Multi-line SQL (e.g. CREATE TABLE): use Dart triple-quote strings
      // to match the pattern in migration-codegen.ts.
      lines.push("await customStatement('''");
      lines.push(`  ${stmt}`);
      lines.push("''');");
    } else {
      // Single-line SQL: use regular Dart string with escaping.
      const escaped = stmt.replace(/'/g, "\\'");
      lines.push('await customStatement(');
      lines.push(`  '${escaped}',`);
      lines.push(');');
    }
    lines.push('');
  }

  return lines.join('\n');
}
