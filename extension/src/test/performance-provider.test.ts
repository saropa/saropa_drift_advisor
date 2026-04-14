/**
 * Slow-query and index-pattern tests for PerformanceProvider.
 *
 * N+1 detection and provideCodeActions tests live in
 * `performance-provider-nplus1.test.ts`.
 * Shared helpers live in `performance-provider-test-helpers.ts`.
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import { DiagnosticSeverity } from './vscode-mock-classes';
import { resetMocks } from './vscode-mock';
import { PerformanceProvider } from '../diagnostics/providers/performance-provider';
import { createContext, createDartFile } from './performance-provider-test-helpers';

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

  // ─────────────────────────────────────────────────────────
  // Slow query diagnostics
  // ─────────────────────────────────────────────────────────

  describe('collectDiagnostics – slow queries & patterns', () => {
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
      // Without callerFile, severity is downgraded to Information
      // (server-internal query pinned to table definition as fallback).
      assert.strictEqual(issue.severity, DiagnosticSeverity.Information);
    });

    it('should include row count in slow-query-pattern message', async () => {
      const ctx = createContext({
        dartFiles: [createDartFile('orders', ['id'])],
        slowQueries: [
          { sql: 'SELECT * FROM orders', durationMs: 200, rowCount: 500, at: '2024-01-01' },
        ],
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'slow-query-pattern');
      assert.ok(issue, 'Should report slow-query-pattern');
      assert.ok(
        issue.message.includes('500 rows'),
        `Expected row count in message but got: ${issue.message}`,
      );
    });

    it('should pin slow-query-pattern to caller location when available', async () => {
      const ctx = createContext({
        dartFiles: [createDartFile('orders', ['id', 'user_id', 'total'])],
        slowQueries: [
          {
            sql: 'SELECT * FROM orders WHERE user_id = 42',
            durationMs: 150,
            rowCount: 100,
            at: '2024-01-01',
            callerFile: 'package:myapp/src/order_io.dart',
            callerLine: 42,
          },
        ],
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'slow-query-pattern');
      assert.ok(issue, 'Should report slow-query-pattern');
      // Should point to the caller file, not the table definition.
      assert.ok(
        issue.fileUri.toString().includes('order_io.dart'),
        `Expected caller file URI but got ${issue.fileUri.toString()}`,
      );
      // callerLine 42 is 1-based → Range line should be 41 (0-based).
      assert.strictEqual(issue.range.start.line, 41);
      // With caller location → full Warning severity (user-code query).
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

    // ─────────────────────────────────────────────────────────
    // Edge cases: limits, errors, truncation
    // ─────────────────────────────────────────────────────────

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

    it('should suppress slow-query and n-plus-one when runtime category is disabled', async () => {
      const ctx = createContext({
        dartFiles: [createDartFile('orders', ['id'])],
        slowQueries: [
          { sql: 'SELECT * FROM orders', durationMs: 200, rowCount: 10, at: '2024-01-01' },
        ],
        recentQueries: Array(15).fill(null).map((_, i) => ({
          sql: `SELECT * FROM orders WHERE id = ${i}`,
          durationMs: 10,
          rowCount: 1,
          at: '2024-01-01',
        })),
      });
      // Disable the runtime category.
      ctx.config.categories.runtime = false;

      const issues = await provider.collectDiagnostics(ctx);

      const slowIssue = issues.find((i) => i.code === 'slow-query-pattern');
      const nplusOne = issues.find((i) => i.code === 'n-plus-one');
      assert.ok(!slowIssue, 'slow-query-pattern should be suppressed when runtime is disabled');
      assert.ok(!nplusOne, 'n-plus-one should be suppressed when runtime is disabled');
    });

    it('should return empty array when server is unreachable', async () => {
      const ctx = createContext({ dartFiles: [], slowQueries: [] });
      (ctx.client.performance as any) = () => Promise.reject(new Error('Server down'));

      const issues = await provider.collectDiagnostics(ctx);

      assert.strictEqual(issues.length, 0);
    });

    it('should not report slow-query-pattern for internal queries', async () => {
      // Internal queries (change-detection probes) should be filtered
      // out even if they exceed the slow-query threshold. This is the
      // safety-net filter on the extension side — the server already
      // excludes them from slowQueries, but the checker guards too.
      const ctx = createContext({
        dartFiles: [createDartFile('creators', ['tvmaze_person_id', 'name'])],
        slowQueries: [
          {
            sql: "SELECT 'creators' AS t, COUNT(*) AS c FROM \"creators\"",
            durationMs: 200,
            rowCount: 1,
            at: '2024-01-01',
            isInternal: true,
          },
        ],
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'slow-query-pattern');
      assert.ok(!issue, 'Internal queries should not produce slow-query diagnostics');
    });

    it('should report slow queries alongside internal ones (only non-internal)', async () => {
      // Mix of internal and user queries — only the user query should
      // produce a diagnostic, verifying the filter is selective.
      const ctx = createContext({
        dartFiles: [
          createDartFile('orders', ['id', 'user_id', 'total']),
          createDartFile('creators', ['tvmaze_person_id', 'name']),
        ],
        slowQueries: [
          {
            sql: 'SELECT * FROM orders WHERE user_id = 42',
            durationMs: 150,
            rowCount: 100,
            at: '2024-01-01',
          },
          {
            sql: "SELECT 'creators' AS t, COUNT(*) AS c FROM \"creators\"",
            durationMs: 300,
            rowCount: 1,
            at: '2024-01-01',
            isInternal: true,
          },
        ],
      });

      const issues = await provider.collectDiagnostics(ctx);

      const slowIssues = issues.filter((i) => i.code === 'slow-query-pattern');
      assert.strictEqual(slowIssues.length, 1, 'Only the user query should produce a diagnostic');
      assert.ok(slowIssues[0].message.includes('150ms'));
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
});
