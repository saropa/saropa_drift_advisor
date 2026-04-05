import * as assert from 'assert';
import * as sinon from 'sinon';
import {
  Diagnostic,
  DiagnosticRelatedInformation,
  DiagnosticSeverity,
  Location,
  Range,
  Uri,
} from './vscode-mock-classes';
import { resetMocks } from './vscode-mock';
import { DriftApiClient } from '../api-client';
import { SchemaIntelligence } from '../engines/schema-intelligence';
import { QueryIntelligence } from '../engines/query-intelligence';
import { PerformanceProvider } from '../diagnostics/providers/performance-provider';
import type { IDartFileInfo, IDiagnosticContext } from '../diagnostics/diagnostic-types';
import type { IDartTable } from '../schema-diff/dart-schema';

describe('PerformanceProvider', () => {
  let provider: PerformanceProvider;
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    fetchStub = sinon.stub(global, 'fetch');
    fetchStub.resolves(new Response(JSON.stringify([]), { status: 200 }));

    provider = new PerformanceProvider();
    resetMocks();
  });

  afterEach(() => {
    provider.dispose();
    sinon.restore();
  });

  describe('collectDiagnostics', () => {
    it('should report slow-query-pattern for queries over threshold', async () => {
      const ctx = createContext({
        dartFiles: [createDartFile('orders', ['id', 'user_id', 'total'])],
        slowQueries: [
          { sql: 'SELECT * FROM orders WHERE user_id = 42', durationMs: 150, rowCount: 100, at: '2024-01-01' },
        ],
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'slow-query-pattern');
      assert.ok(issue, 'Should report slow-query-pattern');
      assert.ok(issue.message.includes('150ms'));
      assert.strictEqual(issue.severity, DiagnosticSeverity.Warning);
    });

    it('should not report queries under threshold', async () => {
      const ctx = createContext({
        dartFiles: [createDartFile('orders', ['id', 'user_id'])],
        slowQueries: [
          { sql: 'SELECT * FROM orders', durationMs: 50, rowCount: 10, at: '2024-01-01' },
        ],
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'slow-query-pattern');
      assert.ok(!issue, 'Should not report fast queries');
    });

    it('should report unindexed-where-clause from query patterns', async () => {
      const ctx = createContext({
        dartFiles: [createDartFile('users', ['id', 'email'])],
        patternSuggestions: [{
          table: 'users',
          column: 'email',
          reason: 'Frequent WHERE',
          usageCount: 10,
          potentialSavingsMs: 500,
          sql: 'CREATE INDEX idx_users_email ON users(email)',
        }],
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'unindexed-where-clause');
      assert.ok(issue, 'Should report unindexed-where-clause');
      assert.ok(issue.message.includes('email'));
      assert.ok(issue.message.includes('10 queries'));
      assert.ok(issue.relatedInfo?.[0].message.includes('CREATE INDEX'));
    });

    it('should not report patterns under minimum count', async () => {
      const ctx = createContext({
        dartFiles: [createDartFile('users', ['id', 'email'])],
        patternSuggestions: [{
          table: 'users',
          column: 'email',
          reason: 'Infrequent WHERE',
          usageCount: 2,
          potentialSavingsMs: 50,
          sql: 'CREATE INDEX idx_users_email ON users(email)',
        }],
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'unindexed-where-clause');
      assert.ok(!issue, 'Should not report infrequent patterns');
    });

    it('should report n-plus-one pattern for repeated similar queries', async () => {
      const ctx = createContext({
        dartFiles: [createDartFile('users', ['id', 'name'])],
        recentQueries: Array(15).fill(null).map((_, i) => ({
          sql: `SELECT * FROM users WHERE id = ${i}`,
          durationMs: 10,
          rowCount: 1,
          at: '2024-01-01',
        })),
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'n-plus-one');
      assert.ok(issue, 'Should report n-plus-one pattern');
      assert.ok(issue.message.includes('users'));
      assert.ok(issue.message.includes('15 times'));
    });

    it('should not report n-plus-one for write operations (INSERT/UPDATE/DELETE)', async () => {
      // Activity log tables generate many independent INSERTs from separate user
      // actions — this is expected behavior, not an N+1 pattern.
      const ctx = createContext({
        dartFiles: [createDartFile('activities', ['id', 'action', 'user_id'])],
        recentQueries: Array(15).fill(null).map((_, i) => ({
          sql: `INSERT INTO activities (action, user_id) VALUES ('view_contact', ${i})`,
          durationMs: 5,
          rowCount: 1,
          at: '2024-01-01',
        })),
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'n-plus-one');
      assert.ok(!issue, 'Should not flag write-heavy tables as N+1');
    });

    it('should not report n-plus-one for UPDATE operations', async () => {
      const ctx = createContext({
        dartFiles: [createDartFile('users', ['id', 'name'])],
        recentQueries: Array(15).fill(null).map((_, i) => ({
          sql: `UPDATE users SET name = 'user_${i}' WHERE id = ${i}`,
          durationMs: 5,
          rowCount: 1,
          at: '2024-01-01',
        })),
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'n-plus-one');
      assert.ok(!issue, 'Should not flag UPDATE operations as N+1');
    });

    it('should not report n-plus-one for DELETE operations', async () => {
      const ctx = createContext({
        dartFiles: [createDartFile('sessions', ['id', 'user_id'])],
        recentQueries: Array(15).fill(null).map((_, i) => ({
          sql: `DELETE FROM sessions WHERE id = ${i}`,
          durationMs: 5,
          rowCount: 1,
          at: '2024-01-01',
        })),
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'n-plus-one');
      assert.ok(!issue, 'Should not flag DELETE operations as N+1');
    });

    it('should still detect n-plus-one SELECTs when mixed with writes', async () => {
      // A stream with enough SELECTs to trigger the threshold should still
      // fire, even if writes to the same table are also present.
      const selects = Array(12).fill(null).map((_, i) => ({
        sql: `SELECT * FROM users WHERE id = ${i}`,
        durationMs: 10,
        rowCount: 1,
        at: '2024-01-01',
      }));
      const inserts = Array(5).fill(null).map((_, i) => ({
        sql: `INSERT INTO users (name) VALUES ('user_${i}')`,
        durationMs: 5,
        rowCount: 1,
        at: '2024-01-01',
      }));
      const ctx = createContext({
        dartFiles: [createDartFile('users', ['id', 'name'])],
        recentQueries: [...selects, ...inserts],
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'n-plus-one');
      assert.ok(issue, 'Should still detect N+1 SELECTs even when writes are present');
      // The count should reflect only SELECTs (12), not total queries (17)
      assert.ok(issue.message.includes('12 times'), 'Count should reflect only SELECT queries');
    });

    it('should limit slow query diagnostics to max count', async () => {
      const ctx = createContext({
        dartFiles: [createDartFile('orders', ['id'])],
        slowQueries: Array(20).fill(null).map((_, i) => ({
          sql: `SELECT * FROM orders WHERE id = ${i}`,
          durationMs: 200,
          rowCount: 1,
          at: '2024-01-01',
        })),
      });

      const issues = await provider.collectDiagnostics(ctx);

      const slowIssues = issues.filter((i) => i.code === 'slow-query-pattern');
      assert.ok(slowIssues.length <= 10, 'Should limit slow query diagnostics');
    });

    it('should return empty array when server is unreachable', async () => {
      const ctx = createContext({ dartFiles: [], slowQueries: [] });
      (ctx.client.performance as any) = () => Promise.reject(new Error('Server down'));

      const issues = await provider.collectDiagnostics(ctx);

      assert.strictEqual(issues.length, 0);
    });

    it('should truncate long SQL in diagnostic message', async () => {
      const longSql = 'SELECT id, name, email, address, phone, created_at, updated_at FROM orders WHERE status = 1 AND user_id = 42 ORDER BY created_at DESC';
      const ctx = createContext({
        dartFiles: [createDartFile('orders', ['id'])],
        slowQueries: [
          { sql: longSql, durationMs: 200, rowCount: 100, at: '2024-01-01' },
        ],
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'slow-query-pattern');
      assert.ok(issue, 'Should report slow query');
      assert.ok(issue.message.length < 100, 'Message should be truncated');
      assert.ok(issue.message.includes('...'), 'Should have ellipsis');
    });
  });

  describe('provideCodeActions', () => {
    it('should provide Analyze and Performance actions for slow-query-pattern', () => {
      const diag = new Diagnostic(
        new Range(10, 0, 10, 100),
        '[drift_advisor] Slow query',
        DiagnosticSeverity.Warning,
      );
      diag.code = 'slow-query-pattern';

      const actions = provider.provideCodeActions(diag as any, {} as any);

      assert.ok(actions.some((a) => a.title.includes('Analyze')));
      assert.ok(actions.some((a) => a.title.includes('Performance')));
    });

    it('should provide Copy action for unindexed-where-clause', () => {
      const diag = new Diagnostic(
        new Range(10, 0, 10, 100),
        '[drift_advisor] Unindexed WHERE',
        DiagnosticSeverity.Warning,
      );
      diag.code = 'unindexed-where-clause';
      (diag as any).data = { sql: 'CREATE INDEX idx ON t(c)' };

      const actions = provider.provideCodeActions(diag as any, {} as any);

      assert.ok(actions.some((a) => a.title.includes('Copy')));
    });

    it('should provide Learn action for n-plus-one', () => {
      const diag = new Diagnostic(
        new Range(10, 0, 10, 100),
        '[drift_advisor] N+1 pattern',
        DiagnosticSeverity.Warning,
      );
      diag.code = 'n-plus-one';

      const actions = provider.provideCodeActions(diag as any, {} as any);

      assert.ok(actions.some((a) => a.title.includes('Learn')));
    });
  });
});

function createContext(options: {
  dartFiles: IDartFileInfo[];
  slowQueries?: Array<{ sql: string; durationMs: number; rowCount: number; at: string }>;
  recentQueries?: Array<{ sql: string; durationMs: number; rowCount: number; at: string }>;
  patternSuggestions?: Array<{
    table: string;
    column: string;
    reason: string;
    usageCount: number;
    potentialSavingsMs: number;
    sql: string;
  }>;
}): IDiagnosticContext {
  const queryIntel = {
    getSuggestedIndexes: () => Promise.resolve(options.patternSuggestions ?? []),
  } as any;

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

function createDartFile(
  tableName: string,
  columns: string[],
): IDartFileInfo {
  const dartColumns = columns.map((name, idx) => ({
    dartName: name,
    sqlName: name,
    dartType: name === 'id' || name.endsWith('_id') ? 'IntColumn' : 'TextColumn',
    sqlType: name === 'id' || name.endsWith('_id') ? 'INTEGER' : 'TEXT',
    nullable: false,
    autoIncrement: name === 'id',
    line: 10 + idx,
  }));

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
