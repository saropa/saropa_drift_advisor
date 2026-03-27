/**
 * Shared test helpers for ComplianceChecker tests.
 */

import type { TableMetadata, IDiagramForeignKey } from '../api-types';
import type { IDartTable } from '../schema-diff/dart-schema';

export function makeTable(
  name: string,
  columns: Array<{ name: string; type: string; pk?: boolean }>,
): TableMetadata {
  return {
    name,
    columns: columns.map((c) => ({
      name: c.name,
      type: c.type,
      pk: c.pk ?? false,
    })),
    rowCount: 10,
  };
}

export function makeFk(
  fromTable: string,
  fromColumn: string,
  toTable: string,
  toColumn = 'id',
): IDiagramForeignKey {
  return { fromTable, fromColumn, toTable, toColumn };
}

export function makeDartTable(
  sqlTableName: string,
  columns: Array<{ sqlName: string; nullable?: boolean }>,
): IDartTable {
  return {
    dartClassName: sqlTableName.charAt(0).toUpperCase() + sqlTableName.slice(1),
    sqlTableName,
    columns: columns.map((c, i) => ({
      dartName: c.sqlName,
      sqlName: c.sqlName,
      dartType: 'IntColumn',
      sqlType: 'INTEGER',
      nullable: c.nullable ?? false,
      autoIncrement: false,
      line: 10 + i,
    })),
    indexes: [],
    uniqueKeys: [],
    fileUri: `file:///lib/${sqlTableName}.dart`,
    line: 5,
  };
}
