import * as assert from 'assert';
import * as sinon from 'sinon';
import { DiagnosticSeverity } from './vscode-mock-classes';
import { resetMocks } from './vscode-mock';
import { DataQualityProvider } from '../diagnostics/providers/data-quality-provider';
import { createDartFile } from './diagnostic-test-helpers';
import { createContext } from './data-quality-test-helpers';

describe('DataQualityProvider data-skew', () => {
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
    it('should report data-skew in a many-table schema with a dominant table', async () => {
      // With 10 tables the adaptive threshold is max(50, (100/10)*3 = 30) = 50.
      // A table holding 90% of rows exceeds that threshold, so skew fires.
      // Total rows = 9000 + 9*111 = 9999 >= MIN_ROWS_FOR_SKEW (1000).
      const fillerNames = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9'];
      const ctx = createContext({
        dartFiles: [
          createDartFile('logs', ['id', 'message']),
          ...fillerNames.map((n) => createDartFile(n, ['id'])),
        ],
        tables: [
          { name: 'logs', columns: [{ name: 'id', type: 'INTEGER', pk: true }], rowCount: 9000 },
          ...fillerNames.map((n) => ({
            name: n,
            columns: [{ name: 'id', type: 'INTEGER', pk: true }],
            rowCount: 111,
          })),
        ],
        sizeAnalytics: {
          tables: [
            { table: 'logs', rowCount: 9000, columnCount: 2, indexCount: 1, indexes: [] },
            ...fillerNames.map((n) => ({
              table: n, rowCount: 111, columnCount: 1, indexCount: 1, indexes: [] as string[],
            })),
          ],
        },
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'data-skew');
      assert.ok(issue, 'Should report data-skew in a many-table schema');
      assert.ok(issue.message.includes('logs'));
      assert.ok(issue.message.includes('90%'));
      // Data-skew is an advisory observation, reported at Information.
      assert.strictEqual(issue.severity, DiagnosticSeverity.Information);
    });

    it('should not report data-skew for a two-table database (false positive fix)', async () => {
      // With only 2 tables the even share is 50%, so the adaptive threshold
      // is max(50, 50*3=150) = 150 — unreachable. A 600/500 split (55%)
      // must not fire even though totalRows (1100) exceeds MIN_ROWS_FOR_SKEW.
      // Row counts are above 1000 so this test exercises the adaptive
      // threshold path, not the row-count floor.
      // See BUG_DATA_SKEW_FALSE_POSITIVE_SMALL_TABLE_COUNT.
      const ctx = createContext({
        dartFiles: [
          createDartFile('users', ['id', 'name']),
          createDartFile('settings', ['id', 'value']),
        ],
        tables: [
          { name: 'users', columns: [{ name: 'id', type: 'INTEGER', pk: true }], rowCount: 600 },
          { name: 'settings', columns: [{ name: 'id', type: 'INTEGER', pk: true }], rowCount: 500 },
        ],
        sizeAnalytics: {
          tables: [
            { table: 'users', rowCount: 600, columnCount: 2, indexCount: 1, indexes: [] },
            { table: 'settings', rowCount: 500, columnCount: 1, indexCount: 1, indexes: [] },
          ],
        },
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'data-skew');
      assert.ok(!issue, 'A 600/500 split in a 2-table database is not data skew');
    });

    it('should report data-skew in a 20-table schema with 60% dominant table', async () => {
      // With 20 tables the adaptive threshold is max(50, (100/20)*3 = 15) = 50.
      // A table at 60% exceeds that, and totalRows = 6000+19*210 = 9990 >= 1000.
      const fillerNames = Array.from({ length: 19 }, (_, i) => `filler_${i}`);
      const ctx = createContext({
        dartFiles: [
          createDartFile('events', ['id', 'payload']),
          ...fillerNames.map((n) => createDartFile(n, ['id'])),
        ],
        tables: [
          { name: 'events', columns: [{ name: 'id', type: 'INTEGER', pk: true }], rowCount: 6000 },
          ...fillerNames.map((n) => ({
            name: n,
            columns: [{ name: 'id', type: 'INTEGER', pk: true }],
            rowCount: 210,
          })),
        ],
        sizeAnalytics: {
          tables: [
            { table: 'events', rowCount: 6000, columnCount: 2, indexCount: 1, indexes: [] },
            ...fillerNames.map((n) => ({
              table: n, rowCount: 210, columnCount: 1, indexCount: 1, indexes: [] as string[],
            })),
          ],
        },
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'data-skew');
      assert.ok(issue, 'Should report data-skew at 60% in a 20-table schema');
      assert.ok(issue.message.includes('events'));
    });

    it('should not report data-skew when totalRows is below the floor', async () => {
      // Even with 10 tables and a 90% dominant table, if total rows are
      // below MIN_ROWS_FOR_SKEW (1000), percentages carry no information.
      const fillerNames = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
      const ctx = createContext({
        dartFiles: [
          createDartFile('big', ['id']),
          ...fillerNames.map((n) => createDartFile(n, ['id'])),
        ],
        tables: [
          { name: 'big', columns: [{ name: 'id', type: 'INTEGER', pk: true }], rowCount: 90 },
          ...fillerNames.map((n) => ({
            name: n,
            columns: [{ name: 'id', type: 'INTEGER', pk: true }],
            rowCount: 1,
          })),
        ],
        sizeAnalytics: {
          tables: [
            { table: 'big', rowCount: 90, columnCount: 1, indexCount: 1, indexes: [] },
            ...fillerNames.map((n) => ({
              table: n, rowCount: 1, columnCount: 1, indexCount: 1, indexes: [] as string[],
            })),
          ],
        },
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'data-skew');
      assert.ok(!issue, 'Should not report data-skew when total rows are below the floor');
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

    it('should exclude engine-owned tables from data-skew denominator', async () => {
      // FTS5 shadow tables and sqlite_* internal tables should not inflate
      // the table count or total rows in the skew calculation. Without
      // this exclusion, 5 shadow tables with 15k rows would mask genuine
      // skew in user tables by diluting the denominator.
      const ftsNames = [
        'notes_fts', 'notes_fts_data', 'notes_fts_idx',
        'notes_fts_content', 'notes_fts_docsize', 'notes_fts_config',
      ];
      const ctx = createContext({
        dartFiles: [
          createDartFile('notes', ['id', 'body']),
          ...Array.from({ length: 9 }, (_, i) => createDartFile(`t${i}`, ['id'])),
        ],
        tables: [
          { name: 'notes', columns: [{ name: 'id', type: 'INTEGER', pk: true }], rowCount: 9000 },
          ...Array.from({ length: 9 }, (_, i) => ({
            name: `t${i}`,
            columns: [{ name: 'id', type: 'INTEGER', pk: true }],
            rowCount: 111,
          })),
        ],
        sizeAnalytics: {
          tables: [
            { table: 'notes', rowCount: 9000, columnCount: 2, indexCount: 1, indexes: [] },
            ...Array.from({ length: 9 }, (_, i) => ({
              table: `t${i}`, rowCount: 111, columnCount: 1, indexCount: 1, indexes: [] as string[],
            })),
            // FTS5 shadow tables — should be excluded from skew calculation
            ...ftsNames.map((n) => ({
              table: n, rowCount: 3000, columnCount: 1, indexCount: 0, indexes: [] as string[],
            })),
            // sqlite internal table — should also be excluded
            { table: 'sqlite_sequence', rowCount: 10, columnCount: 2, indexCount: 0, indexes: [] as string[] },
            // android_metadata — platform-owned, should be excluded
            { table: 'android_metadata', rowCount: 1, columnCount: 1, indexCount: 0, indexes: [] as string[] },
          ],
        },
      });

      const issues = await provider.collectDiagnostics(ctx);

      // Skew should still fire on 'notes' — its 9000 rows dominate the
      // 10 user tables (9000 + 9*111 = 9999, notes = 90%). Without the
      // exclusion filter, the 6 FTS tables + sqlite_sequence would push
      // totalRows to ~28k and table count to 18, masking the skew.
      const issue = issues.find((i) => i.code === 'data-skew');
      assert.ok(issue, 'Should detect skew after excluding engine-owned tables');
      assert.ok(issue.message.includes('notes'));
    });
  });
});
