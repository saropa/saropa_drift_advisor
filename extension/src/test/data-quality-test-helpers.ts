import type { IDartFileInfo, IDiagnosticContext } from '../diagnostics/diagnostic-types';

/**
 * Builds an IDiagnosticContext with a stubbed API client for DataQualityProvider
 * tests. Shared by data-quality-provider.test.ts and
 * data-quality-provider-actions.test.ts so the fake schema/size/null-count
 * client lives in one place.
 */
export function createContext(options: {
  dartFiles: IDartFileInfo[];
  tables?: Array<{ name: string; columns: Array<{ name: string; type: string; pk: boolean }>; rowCount: number }>;
  sizeAnalytics?: { tables: Array<{ table: string; rowCount: number; columnCount: number; indexCount: number; indexes: string[] }> };
  nullCounts?: Record<string, number>;
  userDataTables?: string[];
}): IDiagnosticContext {
  const tables = options.tables ?? [];
  const sizeAnalytics = options.sizeAnalytics ?? {
    pageSize: 4096, pageCount: 10, totalSizeBytes: 40960,
    freeSpaceBytes: 1000, usedSizeBytes: 39960, journalMode: 'wal',
    tableCount: tables.length,
    tables: tables.map((t) => ({
      table: t.name, rowCount: t.rowCount, columnCount: t.columns.length, indexCount: 1, indexes: [],
    })),
  };
  const nullCounts = options.nullCounts ?? {};
  const client = {
    schemaMetadata: () => Promise.resolve(tables),
    sizeAnalytics: () => Promise.resolve(sizeAnalytics),
    sql: (query: string) => {
      if (query.includes('IS NULL')) {
        const result: number[] = [];
        for (const table of tables) {
          for (const col of table.columns) { result.push(nullCounts[col.name] ?? 0); }
        }
        return Promise.resolve({ columns: [], rows: [result] });
      }
      return Promise.resolve({ columns: [], rows: [] });
    },
  } as any;
  return {
    client, schemaIntel: {} as any, queryIntel: {} as any,
    dartFiles: options.dartFiles,
    config: {
      enabled: true, refreshOnSave: true, refreshIntervalMs: 30000,
      categories: { schema: true, performance: true, dataQuality: true, bestPractices: true, naming: false, runtime: true, compliance: true },
      disabledRules: new Set(), severityOverrides: {}, tableExclusions: new Map(),
      columnExclusions: new Map(),
      userDataTables: new Set(options.userDataTables ?? []),
    },
  };
}
