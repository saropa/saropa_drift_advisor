/**
 * Schema provider tests — Index suggestion diagnostics.
 *
 * Covers:
 *   - missing-fk-index (high-priority foreign key suggestions)
 *   - missing-id-index (medium-priority _id heuristic suggestions)
 *   - unknown priority handling (e.g. legacy "low")
 *
 * Basic schema diagnostics live in schema-provider.test.ts.
 */
import * as assert from 'assert';
import * as sinon from 'sinon';
import {
  DiagnosticSeverity,
} from './vscode-mock-classes';
import { resetMocks } from './vscode-mock';
import { SchemaProvider } from '../diagnostics/providers/schema-provider';
import { createDartFile } from './diagnostic-test-helpers';
import { createContext } from './schema-provider-test-helpers';

describe('SchemaProvider — index suggestions', () => {
  /** Shared test fixtures — recreated before every test for isolation. */
  let provider: SchemaProvider;
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    // Stub global fetch so no real HTTP requests escape during tests.
    fetchStub = sinon.stub(global, 'fetch');
    fetchStub.resolves(new Response(JSON.stringify([]), { status: 200 }));

    provider = new SchemaProvider();

    resetMocks();
  });

  afterEach(() => {
    provider.dispose();
    sinon.restore();
  });

  describe('collectDiagnostics', () => {
    it('should report missing-fk-index from index suggestions', async () => {
      const ctx = createContext({
        dartFiles: [createDartFile('orders', ['id', 'user_id'])],
        dbTables: [{ name: 'orders', columns: [
          { name: 'id', type: 'INTEGER', pk: true },
          { name: 'user_id', type: 'INTEGER', pk: false },
        ], rowCount: 100 }],
        indexSuggestions: [{
          table: 'orders',
          column: 'user_id',
          reason: 'Foreign key without index',
          sql: 'CREATE INDEX idx_orders_user_id ON orders(user_id)',
          priority: 'high',
        }],
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'missing-fk-index');
      assert.ok(issue, 'Should report missing-fk-index');
      assert.ok(issue.message.includes('user_id'));
      assert.ok(issue.relatedInfo?.[0].message.includes('CREATE INDEX'));
    });

    it('should report missing-id-index for medium-priority _id suggestions', async () => {
      const ctx = createContext({
        dartFiles: [createDartFile('orders', ['id', 'customer_id'])],
        dbTables: [{ name: 'orders', columns: [
          { name: 'id', type: 'INTEGER', pk: true },
          { name: 'customer_id', type: 'INTEGER', pk: false },
        ], rowCount: 50 }],
        indexSuggestions: [{
          table: 'orders',
          column: 'customer_id',
          reason: 'Column ending in _id — likely a join column',
          sql: 'CREATE INDEX idx_orders_customer_id ON orders(customer_id)',
          priority: 'medium',
        }],
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'missing-id-index');
      assert.ok(issue, 'Should report missing-id-index');
      assert.ok(issue.message.includes('customer_id'));
      assert.ok(issue.message.includes('_id'));
      assert.strictEqual(issue.severity, DiagnosticSeverity.Hint);
      // Must NOT use the FK label
      assert.ok(!issue.message.includes('FK column'));
      // Must NOT produce missing-fk-index for _id heuristic columns
      const fkIssues = issues.filter((i) => i.code === 'missing-fk-index');
      assert.strictEqual(fkIssues.length, 0, '_id columns must not produce missing-fk-index');
    });

    it('should silently skip suggestions with unknown priority (e.g. legacy "low")', async () => {
      // If an older server still emits low-priority datetime suggestions,
      // the extension must not crash or produce confusing diagnostics.
      const ctx = createContext({
        dartFiles: [createDartFile('events', ['id', 'created_at'])],
        dbTables: [{ name: 'events', columns: [
          { name: 'id', type: 'INTEGER', pk: true },
          { name: 'created_at', type: 'INTEGER', pk: false },
        ], rowCount: 100 }],
        indexSuggestions: [{
          table: 'events',
          column: 'created_at',
          reason: 'Date/time column — often used in ORDER BY or range queries',
          sql: 'CREATE INDEX idx_events_created_at ON events(created_at)',
          priority: 'low',
        }],
      });

      const issues = await provider.collectDiagnostics(ctx);

      // No diagnostic should be produced for unknown priority tiers
      const indexIssues = issues.filter((i) =>
        i.code === 'missing-fk-index' ||
        i.code === 'missing-id-index' ||
        i.code === 'missing-datetime-index');
      assert.strictEqual(indexIssues.length, 0,
        'Unknown priority suggestions must be silently skipped');
    });

  });
});
