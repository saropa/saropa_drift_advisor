/**
 * Shared test helpers for diagnostic provider tests.
 */

import {
  Range,
  Uri,
} from './vscode-mock-classes';
import type { IDartFileInfo, IDiagnosticIssue, IDiagnosticProvider } from '../diagnostics/diagnostic-types';
import type { IDartTable } from '../schema-diff/dart-schema';

/**
 * Regex matching column names that would be `DateTimeColumn` in Drift.
 * Mirrors the server-side `reDateTimeSuffix` pattern from
 * `server_constants.dart`.
 */
const DATETIME_NAME_RE = /(created|updated|deleted|date|time|_at)$/i;

/** Infer the Drift Dart column type from a column name. */
function inferDartType(name: string): { dartType: string; sqlType: string } {
  if (name === 'id' || name.endsWith('_id')) {
    return { dartType: 'IntColumn', sqlType: 'INTEGER' };
  }
  if (DATETIME_NAME_RE.test(name)) {
    return { dartType: 'DateTimeColumn', sqlType: 'INTEGER' };
  }
  return { dartType: 'TextColumn', sqlType: 'TEXT' };
}

/** Create a mock Dart file with the given table name and columns. */
export function createDartFile(
  tableName: string,
  columns: string[],
): IDartFileInfo {
  const dartColumns = columns.map((name, idx) => {
    const { dartType, sqlType } = inferDartType(name);
    return {
      dartName: name,
      sqlName: name,
      dartType,
      sqlType,
      nullable: false,
      autoIncrement: name === 'id',
      line: 10 + idx,
    };
  });

  const dartTable: IDartTable = {
    dartClassName: tableName.charAt(0).toUpperCase() + tableName.slice(1),
    sqlTableName: tableName,
    columns: dartColumns,
    indexes: [],
    uniqueKeys: [],
    fileUri: `file:///lib/database/${tableName}.dart`,
    line: 5,
  };

  return {
    uri: Uri.parse(`file:///lib/database/${tableName}.dart`) as any,
    text: `class ${dartTable.dartClassName} extends Table {}`,
    tables: [dartTable],
  };
}

/** Create a mock diagnostic provider. */
export function createMockProvider(
  id: string,
  category: 'schema' | 'performance' | 'dataQuality' | 'bestPractices' | 'naming' | 'runtime' | 'compliance',
  issues: IDiagnosticIssue[],
): IDiagnosticProvider {
  return {
    id,
    category,
    collectDiagnostics: () => Promise.resolve(issues),
    dispose: () => {},
  };
}

/** Create a mock diagnostic issue. */
export function createMockIssue(
  code: string,
  message: string,
  line: number,
): IDiagnosticIssue {
  return {
    code,
    message,
    fileUri: Uri.parse('file:///test/tables.dart') as any,
    range: new Range(line, 0, line, 100) as any,
  };
}
