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
import { generateDartFromSql } from './rollback-dart';
import {
  rollbackColumnAdd,
  rollbackColumnRemove,
  rollbackTableDrop,
} from './rollback-helpers';
import { orderForRollback } from './rollback-order';
import { extractColumnName } from './rollback-utils';

export { extractColumnName } from './rollback-utils';

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
  const beforeTables = new Map<string, ITableSnapshot>(
    before.tables.map((t) => [t.name, t]),
  );
  const ordered = orderForRollback(changes);

  for (const change of ordered) {
    switch (change.type) {
      case 'table_added':
        sql.push(`DROP TABLE IF EXISTS "${change.table}";`);
        break;

      case 'table_dropped':
        rollbackTableDrop(change.table, beforeTables, sql, warnings);
        break;

      case 'column_added':
        rollbackColumnAdd(change, sql, warnings);
        break;

      case 'column_removed':
        rollbackColumnRemove(change, beforeTables, sql, warnings);
        break;

      case 'column_type_changed':
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
        change.type satisfies never;
    }
  }

  const uniqueWarnings = [...new Set(warnings)];
  const dart = generateDartFromSql(sql, before.generation, after.generation);

  return { sql, dart, warnings: uniqueWarnings };
}
