/**
 * Shared test helpers for PerformanceProvider test suites.
 *
 * Provides factory functions that build the mock objects needed by
 * PerformanceProvider.collectDiagnostics and provideCodeActions.
 * Extracted so that the test files stay under 300 lines each.
 */

import { Uri } from './vscode-mock-classes';
import type { IDartFileInfo, IDiagnosticContext } from '../diagnostics/diagnostic-types';
import type { IDartTable } from '../schema-diff/dart-schema';

// ───────────────────────────────────────────────────────────
// Types for the option bags accepted by the factory functions
// ───────────────────────────────────────────────────────────

/** Shape of a single slow/recent query entry used in tests. */
export interface ITestQuery {
  sql: string;
  durationMs: number;
  rowCount: number;
  at: string;
  callerFile?: string;
  callerLine?: number;
  /** True when the query was issued by the extension itself (e.g.
   *  change-detection probes), not by the user's application code. */
  isInternal?: boolean;
}

/** Shape of a pattern-based index suggestion used in tests. */
export interface ITestPatternSuggestion {
  table: string;
  column: string;
  reason: string;
  usageCount: number;
  potentialSavingsMs: number;
  sql: string;
}

/** Options bag for `createContext`. */
export interface ICreateContextOptions {
  dartFiles: IDartFileInfo[];
  slowQueries?: ITestQuery[];
  recentQueries?: ITestQuery[];
  patternSuggestions?: ITestPatternSuggestion[];
}

// ───────────────────────────────────────────────────────────
// Factory: IDiagnosticContext
// ───────────────────────────────────────────────────────────

/**
 * Builds a minimal `IDiagnosticContext` suitable for unit-testing
 * `PerformanceProvider`.
 *
 * The returned context wires up:
 * - A fake `client.performance()` that resolves with the supplied queries.
 * - A fake `queryIntel.getSuggestedIndexes()` that resolves with the
 *   supplied pattern suggestions.
 * - Standard config with all categories enabled and no rule overrides.
 */
export function createContext(options: ICreateContextOptions): IDiagnosticContext {
  // Stub query intelligence — only the index suggestion API is needed.
  const queryIntel = {
    getSuggestedIndexes: () => Promise.resolve(options.patternSuggestions ?? []),
  } as any;

  // Stub API client — only the performance endpoint is needed.
  const client = {
    performance: () => Promise.resolve({
      totalQueries: (options.slowQueries?.length ?? 0) + (options.recentQueries?.length ?? 0),
      totalDurationMs: 1000,
      avgDurationMs: 50,
      slowQueries: options.slowQueries ?? [],
      recentQueries: options.recentQueries ?? [],
    }),
  } as any;

  return {
    client,
    schemaIntel: {} as any,
    queryIntel,
    dartFiles: options.dartFiles,
    config: {
      enabled: true,
      refreshOnSave: true,
      refreshIntervalMs: 30000,
      categories: {
        schema: true,
        performance: true,
        dataQuality: true,
        bestPractices: true,
        naming: false,
        runtime: true,
        compliance: true,
      },
      disabledRules: new Set(),
      severityOverrides: {},
    },
  };
}

// ───────────────────────────────────────────────────────────
// Factory: IDartFileInfo
// ───────────────────────────────────────────────────────────

/**
 * Builds a minimal `IDartFileInfo` for a single Drift table.
 *
 * Each column name is mapped to a sensible SQL/Dart type:
 * - `id` or `*_id` columns become `IntColumn / INTEGER`.
 * - Everything else becomes `TextColumn / TEXT`.
 *
 * The `autoIncrement` flag is set only for the column named `id`.
 */
export function createDartFile(
  tableName: string,
  columns: string[],
): IDartFileInfo {
  // Build column descriptors from the name list.
  const dartColumns = columns.map((name, idx) => ({
    dartName: name,
    sqlName: name,
    dartType: name === 'id' || name.endsWith('_id') ? 'IntColumn' : 'TextColumn',
    sqlType: name === 'id' || name.endsWith('_id') ? 'INTEGER' : 'TEXT',
    nullable: false,
    autoIncrement: name === 'id',
    line: 10 + idx,
  }));

  // Build the table descriptor that mirrors a parsed Drift table class.
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
