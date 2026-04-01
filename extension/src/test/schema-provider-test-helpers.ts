/**
 * Test helpers for SchemaProvider tests.
 */

import type { IDartFileInfo, IDiagnosticContext } from '../diagnostics/diagnostic-types';

export interface CreateContextOptions {
  dartFiles: IDartFileInfo[];
  dbTables: Array<{
    name: string;
    columns: Array<{ name: string; type: string; pk: boolean }>;
    rowCount: number;
  }>;
  indexSuggestions?: Array<{
    table: string;
    column: string;
    reason: string;
    sql: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  anomalies?: Array<{ message: string; severity: 'error' | 'warning' | 'info' }>;
}

/** Build a minimal IDiagnosticContext for SchemaProvider tests. */
export function createContext(options: CreateContextOptions): IDiagnosticContext {
  const schemaIntel = {
    getInsights: () => Promise.resolve({
      tables: [],
      totalTables: 0,
      totalColumns: 0,
      totalRows: 0,
      missingIndexes: options.indexSuggestions ?? [],
      anomalies: options.anomalies ?? [],
      tablesWithoutPk: [],
      orphanedFkTables: [],
    }),
  } as any;

  const client = {
    schemaMetadata: () => Promise.resolve(options.dbTables),
  } as any;

  return {
    client,
    schemaIntel,
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
      disabledRules: new Set(),
      severityOverrides: {},
    },
  };
}
