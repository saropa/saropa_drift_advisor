/**
 * Rollback SQL generation helpers: table drop, column add/remove.
 */

import type { ISchemaChange, ITableSnapshot } from '../schema-timeline/schema-timeline-types';
import { extractColumnName } from './rollback-utils';

/**
 * Re-create a dropped table from the before snapshot's column definitions.
 */
export function rollbackTableDrop(
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

/**
 * Drop a column that was added in the forward migration.
 */
export function rollbackColumnAdd(
  change: ISchemaChange,
  sql: string[],
  warnings: string[],
): void {
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

/**
 * Re-add a column that was removed in the forward migration.
 */
export function rollbackColumnRemove(
  change: ISchemaChange,
  beforeTables: Map<string, ITableSnapshot>,
  sql: string[],
  warnings: string[],
): void {
  const colName = extractColumnName(change.detail);
  if (!colName) {
    sql.push(
      `-- Cannot determine column name from: ${change.detail}`,
    );
    return;
  }

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
