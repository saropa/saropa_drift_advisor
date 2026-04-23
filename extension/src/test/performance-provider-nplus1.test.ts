/**
 * N+1 detection tests for PerformanceProvider.
 *
 * Split from the original performance-provider.test.ts to keep each
 * test file under 300 lines.  All n-plus-one pattern tests and the
 * provideCodeActions tests live here.
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import {
  Diagnostic,
  DiagnosticSeverity,
  Range,
} from './vscode-mock-classes';
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
  // N+1 pattern detection
  // ─────────────────────────────────────────────────────────

  describe('collectDiagnostics – n-plus-one', () => {
    it('should include batching hint in n-plus-one message for high counts', async () => {
      const ctx = createContext({
        dartFiles: [createDartFile('users', ['id', 'name'])],
        recentQueries: Array(25).fill(null).map((_, i) => ({
          sql: `SELECT * FROM users WHERE id = ${i}`,
          durationMs: 10,
          rowCount: 1,
          at: '2024-01-01',
        })),
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'n-plus-one');
      assert.ok(issue, 'Should report n-plus-one pattern');
      assert.ok(
        issue.message.includes('JOIN or IN clause'),
        `Expected batching hint in message but got: ${issue.message}`,
      );
    });

    it('should pin n-plus-one to caller location when available', async () => {
      const ctx = createContext({
        dartFiles: [createDartFile('users', ['id', 'name'])],
        recentQueries: Array(15).fill(null).map((_, i) => ({
          sql: `SELECT * FROM users WHERE id = ${i}`,
          durationMs: 10,
          rowCount: 1,
          at: '2024-01-01',
          callerFile: 'package:myapp/src/user_repository.dart',
          callerLine: 88,
        })),
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'n-plus-one');
      assert.ok(issue, 'Should report n-plus-one pattern');
      // Should point to the caller file, not the table definition.
      assert.ok(
        issue.fileUri.toString().includes('user_repository.dart'),
        `Expected caller file URI but got ${issue.fileUri.toString()}`,
      );
      // callerLine 88 is 1-based → Range line should be 87 (0-based).
      assert.strictEqual(issue.range.start.line, 87);
      // With caller location → full Warning severity (user-code query).
      assert.strictEqual(issue.severity, DiagnosticSeverity.Warning);
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
      // Without callerFile → downgraded to Information (server-internal).
      assert.strictEqual(issue.severity, DiagnosticSeverity.Information);
    });

    it('should not count isInternal queries toward n-plus-one (extension probes)', async () => {
      const ctx = createContext({
        dartFiles: [createDartFile('users', ['id', 'name'])],
        recentQueries: Array(15).fill(null).map((_, i) => ({
          sql: `SELECT * FROM users WHERE id = ${i}`,
          durationMs: 10,
          rowCount: 1,
          at: '2024-01-01',
          isInternal: true,
        })),
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'n-plus-one');
      assert.ok(!issue, 'Extension-internal probes must not inflate N+1 counts');
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
  });

  // ─────────────────────────────────────────────────────────
  // Code action tests
  // ─────────────────────────────────────────────────────────

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
