/**
 * Generate Drift table class definitions from runtime SQLite schema.
 * Pure function — no VS Code dependency.
 */

import { ColumnMetadata, TableMetadata } from '../api-client';
import { snakeToCamel, snakeToPascal } from '../dart-names';
import { TableNameMapper } from '../codelens/table-name-mapper';

/** Map SQLite type to Drift Dart column type. */
const SQL_TO_DART_TYPE: Record<string, string> = {
  INTEGER: 'IntColumn',
  TEXT: 'TextColumn',
  REAL: 'RealColumn',
  BLOB: 'BlobColumn',
  NUMERIC: 'IntColumn',
};

/** Map Drift Dart column type to builder method name. */
const DART_TYPE_TO_BUILDER: Record<string, string> = {
  IntColumn: 'integer',
  TextColumn: 'text',
  RealColumn: 'real',
  BlobColumn: 'blob',
};

function sqlToDartType(sqlType: string): string {
  return SQL_TO_DART_TYPE[sqlType.toUpperCase().trim()] ?? 'TextColumn';
}

/** Return a heuristic comment if the column name suggests Bool or DateTime. */
function heuristicComment(
  colName: string,
  sqlType: string,
  isPk: boolean,
): string | null {
  if (isPk || sqlType.toUpperCase() !== 'INTEGER') return null;
  const lower = colName.toLowerCase();
  if (/^(is_|has_|can_)/.test(lower)) return '// Consider: BoolColumn';
  if (/(_at|_date|_time)$/.test(lower)) return '// Consider: DateTimeColumn';
  return null;
}

function generateColumn(col: ColumnMetadata): string {
  const dartType = sqlToDartType(col.type);
  const getter = snakeToCamel(col.name);
  const builder = DART_TYPE_TO_BUILDER[dartType] ?? 'text';

  const parts: string[] = [`${builder}()`];
  if (col.pk && col.type.toUpperCase() === 'INTEGER') {
    parts.splice(0, 1, 'integer().autoIncrement()');
  }

  // Emit .named() when camelCase round-trip doesn't match the SQL name
  const roundTripped = TableNameMapper.dartClassToSnakeCase(getter);
  if (roundTripped !== col.name) {
    parts.push(`named('${col.name}')`);
  }

  const chain = parts.join('.');
  const hint = heuristicComment(col.name, col.type, col.pk);
  const comment = hint ? ` ${hint}` : '';
  return `  ${dartType} get ${getter} => ${chain}();${comment}`;
}

function generateTable(table: TableMetadata): string {
  const className = snakeToPascal(table.name);
  const lines: string[] = [`class ${className} extends Table {`];
  for (const col of table.columns) {
    lines.push(generateColumn(col));
  }
  lines.push('}');
  return lines.join('\n');
}

/**
 * Generate Dart source with Drift table classes for the given tables.
 * Returns a complete Dart file ready for review.
 */
export function generateDartTables(tables: TableMetadata[]): string {
  if (tables.length === 0) return '';

  const parts: string[] = [
    "import 'package:drift/drift.dart';",
    '',
    '/// Generated from runtime schema — review before using.',
    '/// NOTE: Nullability cannot be detected; add .nullable() manually.',
    '',
  ];
  parts.push(tables.map(generateTable).join('\n\n'));
  parts.push('');
  return parts.join('\n');
}
