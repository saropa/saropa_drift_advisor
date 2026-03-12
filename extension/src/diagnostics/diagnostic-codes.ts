import * as vscode from 'vscode';
import type { IDiagnosticCode } from './diagnostic-types';

/**
 * Registry of all diagnostic codes supported by Drift Advisor.
 * Each code has metadata for display, categorization, and severity.
 */
export const DIAGNOSTIC_CODES: Record<string, IDiagnosticCode> = {
  // ============================================================================
  // SCHEMA QUALITY (category: 'schema')
  // ============================================================================

  'no-primary-key': {
    code: 'no-primary-key',
    category: 'schema',
    defaultSeverity: vscode.DiagnosticSeverity.Warning,
    messageTemplate: 'Table "{table}" has no primary key',
    hasFix: true,
  },
  'missing-fk-index': {
    code: 'missing-fk-index',
    category: 'schema',
    defaultSeverity: vscode.DiagnosticSeverity.Warning,
    messageTemplate: 'FK column "{table}.{column}" lacks an index',
    hasFix: true,
  },
  'orphaned-fk': {
    code: 'orphaned-fk',
    category: 'schema',
    defaultSeverity: vscode.DiagnosticSeverity.Error,
    messageTemplate: 'Orphaned FK values in "{table}.{column}" ({count} rows)',
    hasFix: true,
  },
  'fk-type-mismatch': {
    code: 'fk-type-mismatch',
    category: 'schema',
    defaultSeverity: vscode.DiagnosticSeverity.Error,
    messageTemplate:
      'FK "{table}.{column}" type ({type}) doesn\'t match target "{toTable}.{toColumn}" ({toType})',
    hasFix: false,
  },
  'column-type-drift': {
    code: 'column-type-drift',
    category: 'schema',
    defaultSeverity: vscode.DiagnosticSeverity.Warning,
    messageTemplate:
      'Column "{table}.{column}" type mismatch: Dart={dartType}, DB={dbType}',
    hasFix: false,
  },
  'missing-table-in-db': {
    code: 'missing-table-in-db',
    category: 'schema',
    defaultSeverity: vscode.DiagnosticSeverity.Error,
    messageTemplate: 'Table "{table}" defined in Dart but missing from database',
    hasFix: true,
  },
  'missing-column-in-db': {
    code: 'missing-column-in-db',
    category: 'schema',
    defaultSeverity: vscode.DiagnosticSeverity.Error,
    messageTemplate:
      'Column "{table}.{column}" defined in Dart but missing from database',
    hasFix: true,
  },
  'extra-column-in-db': {
    code: 'extra-column-in-db',
    category: 'schema',
    defaultSeverity: vscode.DiagnosticSeverity.Information,
    messageTemplate:
      'Column "{table}.{column}" exists in database but not in Dart',
    hasFix: false,
  },
  'extra-table-in-db': {
    code: 'extra-table-in-db',
    category: 'schema',
    defaultSeverity: vscode.DiagnosticSeverity.Information,
    messageTemplate: 'Table "{table}" exists in database but not in Dart',
    hasFix: false,
  },
  'nullable-mismatch': {
    code: 'nullable-mismatch',
    category: 'schema',
    defaultSeverity: vscode.DiagnosticSeverity.Warning,
    messageTemplate:
      'Column "{table}.{column}" nullability mismatch: Dart={dartNullable}, DB={dbNullable}',
    hasFix: false,
  },
  'anomaly': {
    code: 'anomaly',
    category: 'schema',
    defaultSeverity: vscode.DiagnosticSeverity.Warning,
    messageTemplate: '{message}',
    hasFix: false,
  },

  // ============================================================================
  // QUERY PERFORMANCE (category: 'performance')
  // ============================================================================

  'full-table-scan': {
    code: 'full-table-scan',
    category: 'performance',
    defaultSeverity: vscode.DiagnosticSeverity.Warning,
    messageTemplate: 'Query causes full table scan on "{table}"',
    hasFix: true,
  },
  'temp-btree-sort': {
    code: 'temp-btree-sort',
    category: 'performance',
    defaultSeverity: vscode.DiagnosticSeverity.Information,
    messageTemplate: 'Query uses temporary B-tree for sorting',
    hasFix: false,
  },
  'slow-query-pattern': {
    code: 'slow-query-pattern',
    category: 'performance',
    defaultSeverity: vscode.DiagnosticSeverity.Warning,
    messageTemplate: 'Slow query pattern detected (avg {avgMs}ms)',
    hasFix: false,
  },
  'n-plus-one': {
    code: 'n-plus-one',
    category: 'performance',
    defaultSeverity: vscode.DiagnosticSeverity.Warning,
    messageTemplate:
      'Potential N+1 query pattern: {table} queried {count} times',
    hasFix: false,
  },
  'unindexed-where-clause': {
    code: 'unindexed-where-clause',
    category: 'performance',
    defaultSeverity: vscode.DiagnosticSeverity.Warning,
    messageTemplate:
      'Frequent WHERE on "{table}.{column}" without index ({count} queries)',
    hasFix: true,
  },
  'unindexed-join': {
    code: 'unindexed-join',
    category: 'performance',
    defaultSeverity: vscode.DiagnosticSeverity.Warning,
    messageTemplate: 'JOIN on "{table}.{column}" without index',
    hasFix: true,
  },

  // ============================================================================
  // DATA QUALITY (category: 'dataQuality')
  // ============================================================================

  'high-null-rate': {
    code: 'high-null-rate',
    category: 'dataQuality',
    defaultSeverity: vscode.DiagnosticSeverity.Warning,
    messageTemplate: 'Column "{table}.{column}" has {pct}% NULL values',
    hasFix: false,
  },
  'unique-violation': {
    code: 'unique-violation',
    category: 'dataQuality',
    defaultSeverity: vscode.DiagnosticSeverity.Error,
    messageTemplate:
      'UNIQUE constraint on "{table}.{columns}" has {count} violations',
    hasFix: false,
  },
  'check-violation': {
    code: 'check-violation',
    category: 'dataQuality',
    defaultSeverity: vscode.DiagnosticSeverity.Error,
    messageTemplate:
      'CHECK constraint on "{table}" has {count} violations: {expr}',
    hasFix: false,
  },
  'not-null-violation': {
    code: 'not-null-violation',
    category: 'dataQuality',
    defaultSeverity: vscode.DiagnosticSeverity.Error,
    messageTemplate:
      'NOT NULL on "{table}.{column}" has {count} NULL values',
    hasFix: false,
  },
  'outlier-detected': {
    code: 'outlier-detected',
    category: 'dataQuality',
    defaultSeverity: vscode.DiagnosticSeverity.Information,
    messageTemplate:
      'Column "{table}.{column}" has {count} statistical outliers',
    hasFix: false,
  },
  'empty-table': {
    code: 'empty-table',
    category: 'dataQuality',
    defaultSeverity: vscode.DiagnosticSeverity.Information,
    messageTemplate: 'Table "{table}" is empty (0 rows)',
    hasFix: false,
  },
  'data-skew': {
    code: 'data-skew',
    category: 'dataQuality',
    defaultSeverity: vscode.DiagnosticSeverity.Warning,
    messageTemplate:
      'Table "{table}" has {pct}% of all database rows (data skew)',
    hasFix: false,
  },

  // ============================================================================
  // DRIFT BEST PRACTICES (category: 'bestPractices')
  // ============================================================================

  'missing-migration': {
    code: 'missing-migration',
    category: 'bestPractices',
    defaultSeverity: vscode.DiagnosticSeverity.Warning,
    messageTemplate: 'Schema changes detected but no migration found',
    hasFix: true,
  },
  'autoincrement-not-pk': {
    code: 'autoincrement-not-pk',
    category: 'bestPractices',
    defaultSeverity: vscode.DiagnosticSeverity.Error,
    messageTemplate:
      'Column "{table}.{column}" uses autoIncrement but is not primary key',
    hasFix: false,
  },
  'text-pk': {
    code: 'text-pk',
    category: 'bestPractices',
    defaultSeverity: vscode.DiagnosticSeverity.Warning,
    messageTemplate:
      'Table "{table}" uses TEXT primary key (INTEGER recommended)',
    hasFix: false,
  },
  'blob-column-large': {
    code: 'blob-column-large',
    category: 'bestPractices',
    defaultSeverity: vscode.DiagnosticSeverity.Information,
    messageTemplate:
      'BLOB column "{table}.{column}" may cause memory issues with large data',
    hasFix: false,
  },
  'no-foreign-keys': {
    code: 'no-foreign-keys',
    category: 'bestPractices',
    defaultSeverity: vscode.DiagnosticSeverity.Information,
    messageTemplate: 'Table "{table}" has no foreign key relationships',
    hasFix: false,
  },
  'circular-fk': {
    code: 'circular-fk',
    category: 'bestPractices',
    defaultSeverity: vscode.DiagnosticSeverity.Warning,
    messageTemplate: 'Circular foreign key relationship detected: {path}',
    hasFix: false,
  },
  'cascade-risk': {
    code: 'cascade-risk',
    category: 'bestPractices',
    defaultSeverity: vscode.DiagnosticSeverity.Warning,
    messageTemplate:
      'Deleting from "{table}" would cascade to {count} dependent rows',
    hasFix: false,
  },
  'unused-index': {
    code: 'unused-index',
    category: 'bestPractices',
    defaultSeverity: vscode.DiagnosticSeverity.Information,
    messageTemplate: 'Index "{indexName}" on "{table}" appears unused',
    hasFix: false,
  },
  'duplicate-index': {
    code: 'duplicate-index',
    category: 'bestPractices',
    defaultSeverity: vscode.DiagnosticSeverity.Warning,
    messageTemplate:
      'Index "{index1}" and "{index2}" on "{table}" have identical columns',
    hasFix: false,
  },

  // ============================================================================
  // NAMING CONVENTIONS (category: 'naming')
  // ============================================================================

  'table-name-case': {
    code: 'table-name-case',
    category: 'naming',
    defaultSeverity: vscode.DiagnosticSeverity.Hint,
    messageTemplate: 'Table "{table}" doesn\'t follow snake_case convention',
    hasFix: true,
  },
  'column-name-case': {
    code: 'column-name-case',
    category: 'naming',
    defaultSeverity: vscode.DiagnosticSeverity.Hint,
    messageTemplate:
      'Column "{table}.{column}" doesn\'t follow snake_case convention',
    hasFix: true,
  },
  'reserved-word': {
    code: 'reserved-word',
    category: 'naming',
    defaultSeverity: vscode.DiagnosticSeverity.Warning,
    messageTemplate: 'Column "{table}.{column}" uses SQL reserved word',
    hasFix: false,
  },
  'getter-table-mismatch': {
    code: 'getter-table-mismatch',
    category: 'naming',
    defaultSeverity: vscode.DiagnosticSeverity.Information,
    messageTemplate:
      'Dart getter "{getter}" maps to unexpected SQL name "{sqlName}"',
    hasFix: false,
  },

  // ============================================================================
  // RUNTIME ISSUES (category: 'runtime')
  // ============================================================================

  'data-breakpoint-hit': {
    code: 'data-breakpoint-hit',
    category: 'runtime',
    defaultSeverity: vscode.DiagnosticSeverity.Warning,
    messageTemplate: 'Data breakpoint fired: {message}',
    hasFix: false,
  },
  'row-inserted-alert': {
    code: 'row-inserted-alert',
    category: 'runtime',
    defaultSeverity: vscode.DiagnosticSeverity.Information,
    messageTemplate: '{count} row(s) inserted into "{table}"',
    hasFix: false,
  },
  'row-deleted-alert': {
    code: 'row-deleted-alert',
    category: 'runtime',
    defaultSeverity: vscode.DiagnosticSeverity.Information,
    messageTemplate: '{count} row(s) deleted from "{table}"',
    hasFix: false,
  },
  'connection-error': {
    code: 'connection-error',
    category: 'runtime',
    defaultSeverity: vscode.DiagnosticSeverity.Error,
    messageTemplate: 'Failed to connect to Drift server: {message}',
    hasFix: true,
  },
};

/** Get a diagnostic code by its identifier. */
export function getDiagnosticCode(code: string): IDiagnosticCode | undefined {
  return DIAGNOSTIC_CODES[code];
}

/** Get all diagnostic codes for a specific category. */
export function getDiagnosticCodesByCategory(
  category: string,
): IDiagnosticCode[] {
  return Object.values(DIAGNOSTIC_CODES).filter((c) => c.category === category);
}

/** Get all diagnostic code identifiers. */
export function getAllDiagnosticCodes(): string[] {
  return Object.keys(DIAGNOSTIC_CODES);
}

/** SQL reserved words that should trigger warnings. */
export const SQL_RESERVED_WORDS = new Set([
  'add', 'all', 'alter', 'and', 'as', 'asc', 'between', 'by', 'case', 'check',
  'column', 'constraint', 'create', 'cross', 'current', 'current_date',
  'current_time', 'current_timestamp', 'default', 'delete', 'desc', 'distinct',
  'drop', 'else', 'end', 'escape', 'except', 'exists', 'false', 'for',
  'foreign', 'from', 'full', 'group', 'having', 'in', 'index', 'inner',
  'insert', 'intersect', 'into', 'is', 'join', 'key', 'left', 'like', 'limit',
  'natural', 'not', 'null', 'offset', 'on', 'or', 'order', 'outer', 'primary',
  'references', 'right', 'select', 'set', 'table', 'then', 'to', 'true',
  'union', 'unique', 'update', 'using', 'values', 'when', 'where', 'with',
]);

/** Check if a name is a SQL reserved word. */
export function isSqlReservedWord(name: string): boolean {
  return SQL_RESERVED_WORDS.has(name.toLowerCase());
}

/** Check if a name follows snake_case convention. */
export function isSnakeCase(name: string): boolean {
  return /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(name);
}
