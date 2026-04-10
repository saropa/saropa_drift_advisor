/**
 * Schema provider tests — Part 1: Basic schema diagnostics.
 *
 * Covers the fundamental collectDiagnostics checks:
 *   - missing-table-in-db
 *   - missing-column-in-db
 *   - no-primary-key
 *   - column-type-drift (including DateTime build.yaml hint)
 *   - extra-column-in-db
 *   - text-pk
 *   - missing-fk-index / missing-id-index
 *
 * Matching/acronym tests live in schema-provider-matching.test.ts.
 * Code-action tests live in schema-provider-actions.test.ts.
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

describe('SchemaProvider', () => {
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
    it('should NOT report missing-table-in-db when database is completely empty', async () => {
      // When the DB has zero non-system tables, every Dart table would be
      // "missing" — this indicates an un-migrated/empty DB, not per-table
      // drift. The provider should suppress individual missing-table errors.
      const ctx = createContext({
        dartFiles: [createDartFile('users', ['id', 'name'])],
        dbTables: [], // Empty database
      });

      const issues = await provider.collectDiagnostics(ctx);

      const missingTableIssues = issues.filter((i) => i.code === 'missing-table-in-db');
      assert.strictEqual(
        missingTableIssues.length,
        0,
        'Empty DB should not produce missing-table-in-db diagnostics',
      );
    });

    it('should NOT report missing-table-in-db for multiple tables when DB is empty', async () => {
      // Reproduces the original bug: 11 Dart tables + empty DB = 11 false
      // positives. After the fix, this should produce zero missing-table errors.
      const ctx = createContext({
        dartFiles: [
          createDartFile('tv_listings', ['id', 'title']),
          createDartFile('episode_ratings', ['id', 'score']),
          createDartFile('creators', ['id', 'name']),
        ],
        dbTables: [],
      });

      const issues = await provider.collectDiagnostics(ctx);

      const missingTableIssues = issues.filter((i) => i.code === 'missing-table-in-db');
      assert.strictEqual(
        missingTableIssues.length,
        0,
        'Empty DB with multiple Dart tables should not produce false positives',
      );
    });

    it('should report missing-table-in-db when DB is partially populated', async () => {
      // When the DB has SOME tables but not all, missing ones are genuinely
      // missing (partial migration) and should still be flagged.
      const ctx = createContext({
        dartFiles: [
          createDartFile('users', ['id', 'name']),
          createDartFile('orders', ['id', 'total']),
        ],
        dbTables: [{ name: 'users', columns: [
          { name: 'id', type: 'INTEGER', pk: true },
          { name: 'name', type: 'TEXT', pk: false },
        ], rowCount: 10 }],
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'missing-table-in-db');
      assert.ok(issue, 'Should report missing-table-in-db for partially populated DB');
      assert.ok(issue.message.includes('orders'));
      assert.strictEqual(issue.severity, DiagnosticSeverity.Error);
    });

    it('should report missing-column-in-db when Dart column not in database', async () => {
      const ctx = createContext({
        dartFiles: [createDartFile('users', ['id', 'name', 'email'])],
        dbTables: [{ name: 'users', columns: [
          { name: 'id', type: 'INTEGER', pk: true },
          { name: 'name', type: 'TEXT', pk: false },
        ], rowCount: 10 }],
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'missing-column-in-db');
      assert.ok(issue, 'Should report missing-column-in-db');
      assert.ok(issue.message.includes('email'));
      assert.strictEqual(issue.severity, DiagnosticSeverity.Error);
    });

    it('should report no-primary-key when table lacks PK', async () => {
      const dartFile = createDartFile('logs', ['id', 'message']);
      dartFile.tables[0].columns[0].autoIncrement = false;

      const ctx = createContext({
        dartFiles: [dartFile],
        dbTables: [{ name: 'logs', columns: [
          { name: 'id', type: 'INTEGER', pk: false },
          { name: 'message', type: 'TEXT', pk: false },
        ], rowCount: 100 }],
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'no-primary-key');
      assert.ok(issue, 'Should report no-primary-key');
      assert.ok(issue.message.includes('logs'));
    });

    it('should report column-type-drift with actionable message', async () => {
      const ctx = createContext({
        dartFiles: [createDartFile('users', ['id', 'user_id'])],
        dbTables: [{ name: 'users', columns: [
          { name: 'id', type: 'INTEGER', pk: true },
          { name: 'user_id', type: 'TEXT', pk: false }, // Should be INTEGER (ends with _id)
        ], rowCount: 10 }],
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'column-type-drift');
      assert.ok(issue, 'Should report column-type-drift');
      assert.ok(issue.message.includes('user_id'));
      assert.ok(issue.message.includes('INTEGER'));
      assert.ok(issue.message.includes('TEXT'));
      // Verify the new actionable guidance is present
      assert.ok(
        issue!.message.includes('Either update the database column or change the Dart definition'),
        'Should include actionable fix guidance',
      );
      // Non-DateTime column should NOT include the build.yaml hint
      assert.ok(
        !issue!.message.includes('store_date_time_values_as_text'),
        'Non-DateTime mismatch should not mention store_date_time_values_as_text',
      );
    });

    it('should include build.yaml hint for DateTimeColumn INTEGER/TEXT mismatch', async () => {
      // Simulate a DateTimeColumn that Drift maps to INTEGER (default),
      // but the pre-built database has TEXT.
      const dartFile = createDartFile('events', ['id', 'created_at']);
      // Override the auto-assigned TextColumn to DateTimeColumn
      dartFile.tables[0].columns[1].dartType = 'DateTimeColumn';
      dartFile.tables[0].columns[1].sqlType = 'INTEGER';

      const ctx = createContext({
        dartFiles: [dartFile],
        dbTables: [{ name: 'events', columns: [
          { name: 'id', type: 'INTEGER', pk: true },
          { name: 'created_at', type: 'TEXT', pk: false }, // DB has TEXT, Dart expects INTEGER
        ], rowCount: 50 }],
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'column-type-drift');
      assert.ok(issue, 'Should report column-type-drift for DateTime mismatch');
      assert.ok(
        issue!.message.includes('store_date_time_values_as_text'),
        'DateTime INTEGER/TEXT mismatch should mention store_date_time_values_as_text',
      );
      assert.ok(
        issue!.message.includes('build.yaml'),
        'Should reference build.yaml',
      );
    });

    it('should report extra-column-in-db for DB-only columns', async () => {
      const ctx = createContext({
        dartFiles: [createDartFile('users', ['id'])],
        dbTables: [{ name: 'users', columns: [
          { name: 'id', type: 'INTEGER', pk: true },
          { name: 'legacy_field', type: 'TEXT', pk: false },
        ], rowCount: 10 }],
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'extra-column-in-db');
      assert.ok(issue, 'Should report extra-column-in-db');
      assert.ok(issue.message.includes('legacy_field'));
      assert.strictEqual(issue.severity, DiagnosticSeverity.Information);
    });

    it('should report text-pk for TEXT primary keys', async () => {
      const ctx = createContext({
        dartFiles: [createDartFile('configs', ['key', 'value'])],
        dbTables: [{ name: 'configs', columns: [
          { name: 'key', type: 'TEXT', pk: true },
          { name: 'value', type: 'TEXT', pk: false },
        ], rowCount: 5 }],
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'text-pk');
      assert.ok(issue, 'Should report text-pk');
      assert.ok(issue.message.includes('configs'));
      assert.ok(issue.message.includes('INTEGER recommended'));
    });

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

    it('should suppress low-priority datetime suggestions (bug 002)', async () => {
      const ctx = createContext({
        dartFiles: [createDartFile('users', ['id', 'created_at'])],
        dbTables: [{ name: 'users', columns: [
          { name: 'id', type: 'INTEGER', pk: true },
          { name: 'created_at', type: 'INTEGER', pk: false },
        ], rowCount: 100 }],
        indexSuggestions: [{
          table: 'users',
          column: 'created_at',
          reason: 'Date/time column — often used in ORDER BY or range queries',
          sql: 'CREATE INDEX idx_users_created_at ON users(created_at)',
          priority: 'low',
        }],
      });

      const issues = await provider.collectDiagnostics(ctx);

      // Low-priority datetime suggestions are suppressed to avoid mass
      // false positives. Legitimate cases are caught by unindexed-where-clause.
      const issue = issues.find((i) => i.code === 'missing-datetime-index');
      assert.strictEqual(issue, undefined,
        'Low-priority datetime suggestions must be suppressed (bug 002)');
    });

    it('should emit high/medium but suppress low when mixed priorities present (bug 002)', async () => {
      // Verifies that suppressing low-priority suggestions does not
      // interfere with high and medium suggestions on the same table.
      const ctx = createContext({
        dartFiles: [createDartFile('orders', ['id', 'customer_id', 'created_at'])],
        dbTables: [{ name: 'orders', columns: [
          { name: 'id', type: 'INTEGER', pk: true },
          { name: 'customer_id', type: 'INTEGER', pk: false },
          { name: 'created_at', type: 'INTEGER', pk: false },
        ], rowCount: 200 }],
        indexSuggestions: [
          {
            table: 'orders',
            column: 'customer_id',
            reason: 'Foreign key without index',
            sql: 'CREATE INDEX idx_orders_customer_id ON orders(customer_id)',
            priority: 'high',
          },
          {
            table: 'orders',
            column: 'created_at',
            reason: 'Date/time column — often used in ORDER BY or range queries',
            sql: 'CREATE INDEX idx_orders_created_at ON orders(created_at)',
            priority: 'low',
          },
        ],
      });

      const issues = await provider.collectDiagnostics(ctx);

      // High-priority FK suggestion must still be emitted
      const fkIssue = issues.find((i) => i.code === 'missing-fk-index');
      assert.ok(fkIssue, 'High-priority FK suggestion must still be reported');
      assert.ok(fkIssue.message.includes('customer_id'));

      // Low-priority datetime suggestion must be suppressed
      const dtIssue = issues.find((i) => i.code === 'missing-datetime-index');
      assert.strictEqual(dtIssue, undefined,
        'Low-priority datetime suggestion must be suppressed even alongside high-priority');
    });
  });
});
