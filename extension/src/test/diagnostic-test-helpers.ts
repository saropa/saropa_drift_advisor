/**
 * Shared test helpers for diagnostic provider tests.
 */

import {
  Range,
  Uri,
} from './vscode-mock-classes';
import type { IDartFileInfo, IDiagnosticIssue, IDiagnosticProvider } from '../diagnostics/diagnostic-types';
import type { IDartTable } from '../schema-diff/dart-schema';
import { emptySuppressions } from '../diagnostics/suppression';

/**
 * Regex matching column names that would be `DateTimeColumn` in Drift.
 * Mirrors the server-side `reDateTimeSuffix` pattern from
 * `server_constants.dart`. Bare `time` is intentionally excluded —
 * it false-positives on boolean columns like `is_free_time` (bug 001).
 */
const DATETIME_NAME_RE = /(created|updated|deleted|date|timestamp|_at)$/i;

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

/**
 * A column for {@link createDartFile}: either a bare SQL name (defaults applied)
 * or an object overriding the parsed declaration flags. The object form lets
 * tests exercise null-by-design detection (nullable `*_at`, `.withDefault(...)`).
 */
export type MockColumnSpec =
  | string
  | { name: string; nullable?: boolean; autoIncrement?: boolean; hasDefault?: boolean };

/** Create a mock Dart file with the given table name and columns. */
export function createDartFile(
  tableName: string,
  columns: MockColumnSpec[],
): IDartFileInfo {
  const dartColumns = columns.map((spec, idx) => {
    const col = typeof spec === 'string' ? { name: spec } : spec;
    const { dartType, sqlType } = inferDartType(col.name);
    return {
      dartName: col.name,
      sqlName: col.name,
      dartType,
      sqlType,
      nullable: col.nullable ?? false,
      autoIncrement: col.autoIncrement ?? col.name === 'id',
      hasDefault: col.hasDefault ?? false,
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
    suppressions: emptySuppressions(),
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
  data?: Record<string, unknown>,
): IDiagnosticIssue {
  return {
    code,
    message,
    fileUri: Uri.parse('file:///test/tables.dart') as any,
    range: new Range(line, 0, line, 100) as any,
    data,
  };
}
