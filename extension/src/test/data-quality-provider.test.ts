import * as assert from 'assert';
import * as sinon from 'sinon';
import {
  Diagnostic,
  DiagnosticSeverity,
  Range,
} from './vscode-mock-classes';
import { resetMocks } from './vscode-mock';
import { DataQualityProvider } from '../diagnostics/providers/data-quality-provider';
import type { IDartFileInfo, IDiagnosticContext } from '../diagnostics/diagnostic-types';
import { createDartFile } from './diagnostic-test-helpers';

describe('DataQualityProvider', () => {
  let provider: DataQualityProvider;
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    fetchStub = sinon.stub(global, 'fetch');
    fetchStub.resolves(new Response(JSON.stringify([]), { status: 200 }));

    provider = new DataQualityProvider();
    resetMocks();
  });

  afterEach(() => {
    provider.dispose();
    sinon.restore();
  });

  describe('collectDiagnostics', () => {
    it('should not report empty-table (diagnostic removed)', async () => {
      // Empty tables are a valid database state, not a data quality issue.
      // Tables start empty and are populated through application logic —
      // user-data tables, cache tables, and static-data tables are all
      // legitimately empty until their respective features are triggered.
      const ctx = createContext({
        dartFiles: [createDartFile('users', ['id', 'name'])],
        tables: [
          { name: 'users', columns: [{ name: 'id', type: 'INTEGER', pk: true }], rowCount: 0 },
        ],
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'empty-table');
      assert.ok(!issue, 'Should not report empty-table diagnostic');
    });

    it('should report data-skew when table has >50% of rows', async () => {
      const ctx = createContext({
        dartFiles: [
          createDartFile('logs', ['id', 'message']),
          createDartFile('users', ['id', 'name']),
        ],
        tables: [
          { name: 'logs', columns: [{ name: 'id', type: 'INTEGER', pk: true }], rowCount: 900 },
          { name: 'users', columns: [{ name: 'id', type: 'INTEGER', pk: true }], rowCount: 100 },
        ],
        sizeAnalytics: {
          tables: [
            { table: 'logs', rowCount: 900, columnCount: 2, indexCount: 1, indexes: [] },
            { table: 'users', rowCount: 100, columnCount: 2, indexCount: 1, indexes: [] },
          ],
        },
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'data-skew');
      assert.ok(issue, 'Should report data-skew');
      assert.ok(issue.message.includes('logs'));
      assert.ok(issue.message.includes('90%'));
      // Data-skew is an advisory observation, reported at Information.
      assert.strictEqual(issue.severity, DiagnosticSeverity.Information);
    });

    it('should not report data-skew when rows are balanced', async () => {
      const ctx = createContext({
        dartFiles: [
          createDartFile('users', ['id']),
          createDartFile('orders', ['id']),
        ],
        tables: [
          { name: 'users', columns: [{ name: 'id', type: 'INTEGER', pk: true }], rowCount: 100 },
          { name: 'orders', columns: [{ name: 'id', type: 'INTEGER', pk: true }], rowCount: 100 },
        ],
        sizeAnalytics: {
          tables: [
            { table: 'users', rowCount: 100, columnCount: 1, indexCount: 1, indexes: [] },
            { table: 'orders', rowCount: 100, columnCount: 1, indexCount: 1, indexes: [] },
          ],
        },
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'data-skew');
      assert.ok(!issue, 'Should not report balanced data');
    });

    it('should report high-null-rate for columns with >50% nulls', async () => {
      const ctx = createContext({
        dartFiles: [createDartFile('users', ['id', 'bio'])],
        tables: [
          {
            name: 'users',
            columns: [
              { name: 'id', type: 'INTEGER', pk: true },
              { name: 'bio', type: 'TEXT', pk: false },
            ],
            rowCount: 100,
          },
        ],
        nullCounts: { bio: 75 },
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'high-null-rate');
      assert.ok(issue, 'Should report high-null-rate');
      assert.ok(issue.message.includes('bio'));
      assert.ok(issue.message.includes('75%'));
      // High-null-rate is advisory, reported at Information (not a defect).
      assert.strictEqual(issue.severity, DiagnosticSeverity.Information);
    });

    it('should report unused-column (not high-null-rate) for a 100% NULL column', async () => {
      // A column where every row is NULL is "unused" — a distinct finding from
      // a merely high null rate. It must surface as unused-column so users can
      // act on / suppress it separately.
      const ctx = createContext({
        dartFiles: [createDartFile('users', ['id', 'middle_name'])],
        tables: [
          {
            name: 'users',
            columns: [
              { name: 'id', type: 'INTEGER', pk: true },
              { name: 'middle_name', type: 'TEXT', pk: false },
            ],
            rowCount: 100,
          },
        ],
        nullCounts: { middle_name: 100 },
      });

      const issues = await provider.collectDiagnostics(ctx);

      const unused = issues.find((i) => i.code === 'unused-column');
      assert.ok(unused, 'Should report unused-column for a 100% NULL column');
      assert.ok(unused.message.includes('middle_name'));
      assert.ok(unused.message.includes('100%'));
      // The 100% case must NOT also fire the partial high-null-rate code.
      const highNull = issues.find((i) => i.code === 'high-null-rate');
      assert.ok(!highNull, 'A 100% NULL column should not also be high-null-rate');
    });

    it('should report high-null-rate (not unused-column) for a 94% NULL column', async () => {
      // Just-below-100% stays high-null-rate even though it rounds to "94%" —
      // the split keys on the raw count, not the rounded percentage.
      const ctx = createContext({
        dartFiles: [createDartFile('users', ['id', 'middle_name'])],
        tables: [
          {
            name: 'users',
            columns: [
              { name: 'id', type: 'INTEGER', pk: true },
              { name: 'middle_name', type: 'TEXT', pk: false },
            ],
            rowCount: 100,
          },
        ],
        nullCounts: { middle_name: 94 },
      });

      const issues = await provider.collectDiagnostics(ctx);

      assert.ok(
        issues.find((i) => i.code === 'high-null-rate'),
        'Should report high-null-rate for a 94% NULL column',
      );
      assert.ok(
        !issues.find((i) => i.code === 'unused-column'),
        'A 94% NULL column is not unused',
      );
    });

    it('should not report high-null-rate for columns with low null percentage', async () => {
      const ctx = createContext({
        dartFiles: [createDartFile('users', ['id', 'bio'])],
        tables: [
          {
            name: 'users',
            columns: [
              { name: 'id', type: 'INTEGER', pk: true },
              { name: 'bio', type: 'TEXT', pk: false },
            ],
            rowCount: 100,
          },
        ],
        nullCounts: { bio: 10 },
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'high-null-rate');
      assert.ok(!issue, 'Should not report low null rate');
    });

    it('should skip null rate check for small tables', async () => {
      const ctx = createContext({
        dartFiles: [createDartFile('configs', ['id', 'value'])],
        tables: [
          {
            name: 'configs',
            columns: [
              { name: 'id', type: 'INTEGER', pk: true },
              { name: 'value', type: 'TEXT', pk: false },
            ],
            rowCount: 5,
          },
        ],
        nullCounts: { value: 4 },
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'high-null-rate');
      assert.ok(!issue, 'Should skip small tables');
    });

    it('should skip null-rate analysis for tables listed in userDataTables', async () => {
      // FP-1: a table whose live debug rows are unrepresentative (user/demo
      // data, or a partially-loaded static table) must be skipped entirely —
      // a null rate measured on a partial table says nothing about the source.
      const ctx = createContext({
        dartFiles: [createDartFile('contacts', ['id', 'bio'])],
        tables: [
          {
            name: 'contacts',
            columns: [
              { name: 'id', type: 'INTEGER', pk: true },
              { name: 'bio', type: 'TEXT', pk: false },
            ],
            rowCount: 339,
          },
        ],
        nullCounts: { bio: 339 },
        userDataTables: ['contacts'],
      });

      const issues = await provider.collectDiagnostics(ctx);

      assert.ok(
        !issues.find((i) => i.code === 'high-null-rate' || i.code === 'unused-column'),
        'Should not report null findings for an unrepresentative user-data table',
      );
    });

    it('should not flag a nullable null-by-design column (*_at / *_phonetic)', async () => {
      // FP-2: nullable event timestamps and phonetic search-helper columns are
      // correct to be mostly/entirely NULL. They must not surface as findings.
      const ctx = createContext({
        dartFiles: [
          createDartFile('contacts', [
            'id',
            { name: 'blocked_at', nullable: true },
            { name: 'name_phonetic', nullable: true },
          ]),
        ],
        tables: [
          {
            name: 'contacts',
            columns: [
              { name: 'id', type: 'INTEGER', pk: true },
              { name: 'blocked_at', type: 'INTEGER', pk: false },
              { name: 'name_phonetic', type: 'TEXT', pk: false },
            ],
            rowCount: 100,
          },
        ],
        nullCounts: { blocked_at: 100, name_phonetic: 90 },
      });

      const issues = await provider.collectDiagnostics(ctx);

      assert.ok(
        !issues.find((i) => i.data?.column === 'blocked_at'),
        'A nullable *_at column should not be flagged',
      );
      assert.ok(
        !issues.find((i) => i.data?.column === 'name_phonetic'),
        'A nullable *_phonetic column should not be flagged',
      );
    });

    it('should still flag a non-nullable *_at column with a high null rate', async () => {
      // The null-by-design suffix only applies to nullable columns. A column the
      // schema declares NOT-NULL that is nonetheless measured mostly NULL is a
      // genuine anomaly and must keep reporting.
      const ctx = createContext({
        dartFiles: [createDartFile('events', ['id', { name: 'occurred_at', nullable: false }])],
        tables: [
          {
            name: 'events',
            columns: [
              { name: 'id', type: 'INTEGER', pk: true },
              { name: 'occurred_at', type: 'INTEGER', pk: false },
            ],
            rowCount: 100,
          },
        ],
        nullCounts: { occurred_at: 80 },
      });

      const issues = await provider.collectDiagnostics(ctx);

      assert.ok(
        issues.find((i) => i.data?.column === 'occurred_at'),
        'A non-nullable *_at column with high nulls is a real finding',
      );
    });

    it('should not flag a column declared with a default (.withDefault/.clientDefault)', async () => {
      // FP-2: a defaulted column is null-by-design — unset rows take the default,
      // so a high NULL rate is expected, not a content gap.
      const ctx = createContext({
        dartFiles: [createDartFile('settings', ['id', { name: 'sort_order', hasDefault: true }])],
        tables: [
          {
            name: 'settings',
            columns: [
              { name: 'id', type: 'INTEGER', pk: true },
              { name: 'sort_order', type: 'INTEGER', pk: false },
            ],
            rowCount: 100,
          },
        ],
        nullCounts: { sort_order: 100 },
      });

      const issues = await provider.collectDiagnostics(ctx);

      assert.ok(
        !issues.find((i) => i.data?.column === 'sort_order'),
        'A defaulted column should not be flagged',
      );
    });

    it('should still flag a plain high-null column on a representative table', async () => {
      // Guard against over-suppression: a normal column (not by-design NULL) on a
      // table not in userDataTables must keep reporting — the true positives the
      // checker correctly surfaces (e.g. public_figures.description) stay intact.
      const ctx = createContext({
        dartFiles: [createDartFile('public_figures', ['id', { name: 'description', nullable: true }])],
        tables: [
          {
            name: 'public_figures',
            columns: [
              { name: 'id', type: 'INTEGER', pk: true },
              { name: 'description', type: 'TEXT', pk: false },
            ],
            rowCount: 746,
          },
        ],
        nullCounts: { description: 740 },
      });

      const issues = await provider.collectDiagnostics(ctx);

      assert.ok(
        issues.find((i) => i.data?.column === 'description'),
        'A genuine content gap on a representative table must still report',
      );
    });

    it('should skip the null-rate scan for very large tables', async () => {
      // The null-rate scan is a full-table SUM(CASE WHEN col IS NULL ...)
      // aggregate that reads every row. Run automatically across all tables on
      // the app's live debug connection, it was a primary cause of the startup
      // freeze (BUG_STARTUP_HANG). Tables past MAX_ROWS_FOR_NULL_SCAN (100k) are
      // skipped entirely — verify the expensive scan is never issued, even when
      // the data would otherwise trip the high-null-rate warning.
      const ctx = createContext({
        dartFiles: [createDartFile('public_figure_events', ['id', 'wikidata_id'])],
        tables: [
          {
            name: 'public_figure_events',
            columns: [
              { name: 'id', type: 'INTEGER', pk: true },
              { name: 'wikidata_id', type: 'TEXT', pk: false },
            ],
            rowCount: 200_000,
          },
        ],
        // 75% NULL — would emit high-null-rate if the table were not skipped.
        nullCounts: { wikidata_id: 150_000 },
      });
      const sqlSpy = sinon.spy(ctx.client, 'sql');

      const issues = await provider.collectDiagnostics(ctx);

      const issuedNullScan = sqlSpy
        .getCalls()
        .some((c) => typeof c.args[0] === 'string' && c.args[0].includes('IS NULL'));
      assert.ok(!issuedNullScan, 'Should not issue a full-table null scan on a very large table');
      const issue = issues.find((i) => i.code === 'high-null-rate');
      assert.ok(!issue, 'Should not report high-null-rate for a skipped large table');
    });

    it('should return empty array when server is unreachable', async () => {
      const ctx = createContext({ dartFiles: [], tables: [] });
      (ctx.client.schemaMetadata as any) = () => Promise.reject(new Error('Server down'));

      const issues = await provider.collectDiagnostics(ctx);

      assert.strictEqual(issues.length, 0);
    });
  });

  describe('provideCodeActions', () => {
    it('should provide Profile Column action for high-null-rate', () => {
      const diag = new Diagnostic(
        new Range(10, 0, 10, 100),
        '[drift_advisor] High null rate',
        DiagnosticSeverity.Warning,
      );
      diag.code = 'high-null-rate';
      (diag as any).data = { table: 'users', column: 'bio' };

      const actions = provider.provideCodeActions(diag as any, {} as any);

      assert.ok(actions.some((a) => a.title.includes('Profile')));
    });

    it('should provide a Disable rule action for data-quality diagnostics', () => {
      // Previously the data-quality provider offered no "Disable rule" lightbulb,
      // forcing a manual settings edit. Every code here should now expose it.
      for (const code of ['high-null-rate', 'unused-column', 'data-skew']) {
        const diag = new Diagnostic(
          new Range(10, 0, 10, 100),
          `[drift_advisor] ${code}`,
          DiagnosticSeverity.Warning,
        );
        diag.code = code;
        (diag as any).data = { table: 'users', column: 'bio' };

        const actions = provider.provideCodeActions(diag as any, {} as any);
        const disable = actions.find((a) => a.title.includes('Disable'));
        assert.ok(disable, `Should offer Disable rule for ${code}`);
        assert.strictEqual(disable.command?.command, 'driftViewer.disableDiagnosticRule');
        assert.deepStrictEqual(disable.command?.arguments, [code]);
      }
    });

    it('should provide Size Analytics action for data-skew', () => {
      const diag = new Diagnostic(
        new Range(10, 0, 10, 100),
        '[drift_advisor] Data skew',
        DiagnosticSeverity.Warning,
      );
      diag.code = 'data-skew';

      const actions = provider.provideCodeActions(diag as any, {} as any);

      assert.ok(actions.some((a) => a.title.includes('Size Analytics')));
    });
  });
});

function createContext(options: {
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
