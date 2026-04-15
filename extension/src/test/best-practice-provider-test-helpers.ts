/**
 * Shared test helpers for BestPracticeProvider tests.
 *
 * Extracted from `best-practice-provider.test.ts` so both the main
 * diagnostics test file and the code-actions test file can reuse the
 * same `createContext` factory without duplication.
 */

import type { IDartFileInfo, IDiagnosticContext } from '../diagnostics/diagnostic-types';

/**
 * Build a minimal `IDiagnosticContext` for BestPracticeProvider tests.
 *
 * The returned context stubs `client.schemaMetadata` and
 * `client.tableFkMeta` so that tests can control exactly which tables,
 * columns, and foreign-key relationships the provider sees — without
 * needing a real server connection.
 *
 * @param options.dartFiles - Parsed Dart file descriptors (from `createDartFile`).
 * @param options.tables    - Optional table metadata (columns + row counts).
 * @param options.fkMap     - Optional per-table outbound FK list.
 */
export function createContext(options: {
  dartFiles: IDartFileInfo[];
  tables?: Array<{
    name: string;
    columns: Array<{ name: string; type: string; pk: boolean }>;
    rowCount: number;
  }>;
  fkMap?: Record<string, Array<{ fromColumn: string; toTable: string; toColumn: string }>>;
}): IDiagnosticContext {
  const tables = options.tables ?? [];
  const fkMap = options.fkMap ?? {};

  // Stub the client so that schema and FK queries resolve immediately
  // with the data supplied by the test case
  const client = {
    schemaMetadata: () => Promise.resolve(tables),
    tableFkMeta: (tableName: string) => Promise.resolve(fkMap[tableName] ?? []),
  } as any;

  return {
    client,
    schemaIntel: {} as any,
    queryIntel: {} as any,
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
      severityOverrides: {},
      disabledRules: new Set(),
      tableExclusions: new Map(),
    },
  };
}
