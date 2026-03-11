/**
 * Shared test fixtures for schema-diff tests.
 */

import { IDartColumn, IDartTable } from '../schema-diff/dart-schema';
import { TableMetadata } from '../api-client';

export function dartCol(overrides: Partial<IDartColumn> = {}): IDartColumn {
  return {
    dartName: 'id',
    sqlName: 'id',
    dartType: 'IntColumn',
    sqlType: 'INTEGER',
    nullable: false,
    autoIncrement: false,
    line: 0,
    ...overrides,
  };
}

export function dartTable(overrides: Partial<IDartTable> = {}): IDartTable {
  return {
    dartClassName: 'Users',
    sqlTableName: 'users',
    columns: [dartCol()],
    fileUri: 'file:///test.dart',
    line: 0,
    ...overrides,
  };
}

export function dbMeta(overrides: Partial<TableMetadata> = {}): TableMetadata {
  return {
    name: 'users',
    columns: [{ name: 'id', type: 'INTEGER', pk: true }],
    rowCount: 10,
    ...overrides,
  };
}
