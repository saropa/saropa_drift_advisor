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
 *
 * Index suggestion tests live in schema-provider-index.test.ts.
 * Matching/acronym tests live in schema-provider-matching.test.ts.
 * Code-action tests live in schema-provider-actions.test.ts.
 */
import * as assert from 'assert';
import * as sinon from 'sinon';
import {
  DiagnosticSeverity,
  Uri,
} from './vscode-mock-classes';
import { resetMocks, workspace } from './vscode-mock';
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
    (workspace as any).workspaceFolders = undefined;
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
      // but the pre-built database has TEXT. dateTimeAsText: false means
      // build.yaml explicitly says INTEGER, so this is a real mismatch.
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
        // Explicit false = build.yaml says INTEGER, so TEXT in DB is a real mismatch
        dateTimeAsText: false,
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

    it('should NOT report column-type-drift for DateTimeColumn when dateTimeAsText is true and DB has TEXT', async () => {
      // BUG_COLUMN_TYPE_DRIFT_FALSE_POSITIVE_DATETIME_AS_TEXT:
      // When build.yaml has store_date_time_values_as_text: true,
      // DateTimeColumn should map to TEXT — a TEXT DB column is correct.
      const dartFile = createDartFile('events', ['id', 'created_at']);
      dartFile.tables[0].columns[1].dartType = 'DateTimeColumn';
      dartFile.tables[0].columns[1].sqlType = 'INTEGER'; // Parser still sets default

      const ctx = createContext({
        dartFiles: [dartFile],
        dbTables: [{ name: 'events', columns: [
          { name: 'id', type: 'INTEGER', pk: true },
          { name: 'created_at', type: 'TEXT', pk: false },
        ], rowCount: 50 }],
        // build.yaml says store as text — TEXT in DB is correct
        dateTimeAsText: true,
      });

      const issues = await provider.collectDiagnostics(ctx);

      const typeIssue = issues.find((i) => i.code === 'column-type-drift');
      assert.strictEqual(
        typeIssue,
        undefined,
        'DateTimeColumn with TEXT in DB should NOT fire column-type-drift when dateTimeAsText is true',
      );
    });

    it('should report column-type-drift for DateTimeColumn when dateTimeAsText is false and DB has TEXT', async () => {
      // When build.yaml explicitly says INTEGER (dateTimeAsText: false),
      // a TEXT DB column is a genuine type mismatch.
      const dartFile = createDartFile('events', ['id', 'created_at']);
      dartFile.tables[0].columns[1].dartType = 'DateTimeColumn';
      dartFile.tables[0].columns[1].sqlType = 'INTEGER';

      const ctx = createContext({
        dartFiles: [dartFile],
        dbTables: [{ name: 'events', columns: [
          { name: 'id', type: 'INTEGER', pk: true },
          { name: 'created_at', type: 'TEXT', pk: false },
        ], rowCount: 50 }],
        dateTimeAsText: false,
      });

      const issues = await provider.collectDiagnostics(ctx);

      const typeIssue = issues.find((i) => i.code === 'column-type-drift');
      assert.ok(typeIssue, 'DateTimeColumn with TEXT in DB should fire when dateTimeAsText is false');
      assert.ok(typeIssue!.message.includes('INTEGER'));
      assert.ok(typeIssue!.message.includes('TEXT'));
    });

    it('should NOT report column-type-drift for DateTimeColumn when dateTimeAsText is undefined (build.yaml absent)', async () => {
      // When build.yaml is absent or unparseable, dateTimeAsText is undefined.
      // The checker should accept either INTEGER or TEXT for DateTimeColumn
      // to avoid false positives when we can't determine the project's config.
      const dartFile = createDartFile('events', ['id', 'created_at']);
      dartFile.tables[0].columns[1].dartType = 'DateTimeColumn';
      dartFile.tables[0].columns[1].sqlType = 'INTEGER';

      const ctx = createContext({
        dartFiles: [dartFile],
        dbTables: [{ name: 'events', columns: [
          { name: 'id', type: 'INTEGER', pk: true },
          { name: 'created_at', type: 'TEXT', pk: false },
        ], rowCount: 50 }],
        // dateTimeAsText omitted = undefined = build.yaml absent
      });

      const issues = await provider.collectDiagnostics(ctx);

      const typeIssue = issues.find((i) => i.code === 'column-type-drift');
      assert.strictEqual(
        typeIssue,
        undefined,
        'DateTimeColumn should not fire column-type-drift when build.yaml is absent (accept either type)',
      );
    });

    it('should still report column-type-drift for non-DateTimeColumn even when dateTimeAsText is undefined', async () => {
      // Non-DateTimeColumn type mismatches should still fire regardless of
      // the dateTimeAsText setting — only DateTimeColumn is affected.
      const ctx = createContext({
        dartFiles: [createDartFile('users', ['id', 'user_id'])],
        dbTables: [{ name: 'users', columns: [
          { name: 'id', type: 'INTEGER', pk: true },
          { name: 'user_id', type: 'TEXT', pk: false },
        ], rowCount: 10 }],
        // undefined = build.yaml absent, but IntColumn is not affected
      });

      const issues = await provider.collectDiagnostics(ctx);

      const typeIssue = issues.find((i) => i.code === 'column-type-drift');
      assert.ok(typeIssue, 'Non-DateTimeColumn type drift should still fire when dateTimeAsText is undefined');
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

  });

  describe('FTS5 shadow table filtering', () => {
    it('should NOT report extra-table-in-db for FTS5 shadow tables', async () => {
      // Bug: FTS5 virtual tables create five shadow tables (notes_fts_data,
      // notes_fts_idx, etc.) that don't start with sqlite_ — they all got
      // flagged as extra-table-in-db. The fix filters them in SchemaProvider
      // before they reach checkExtraTablesInDb.
      const ctx = createContext({
        dartFiles: [createDartFile('notes', ['id', 'body'])],
        dbTables: [
          { name: 'notes', columns: [
            { name: 'id', type: 'INTEGER', pk: true },
            { name: 'body', type: 'TEXT', pk: false },
          ], rowCount: 100 },
          // Parent FTS5 virtual table
          { name: 'notes_fts', columns: [], rowCount: 0 },
          // FTS5 shadow tables — these must be filtered out
          { name: 'notes_fts_data', columns: [], rowCount: 0 },
          { name: 'notes_fts_idx', columns: [], rowCount: 0 },
          { name: 'notes_fts_content', columns: [], rowCount: 0 },
          { name: 'notes_fts_docsize', columns: [], rowCount: 0 },
          { name: 'notes_fts_config', columns: [], rowCount: 0 },
        ],
      });

      const issues = await provider.collectDiagnostics(ctx);

      const extraTableIssues = issues.filter((i) => i.code === 'extra-table-in-db');
      // Only notes_fts (the parent virtual table) should remain as extra —
      // the five shadow tables must be excluded.
      assert.strictEqual(
        extraTableIssues.length,
        1,
        `Expected 1 extra-table issue (notes_fts only), got ${extraTableIssues.length}: ${extraTableIssues.map((i) => i.message).join(', ')}`,
      );
      assert.ok(extraTableIssues[0].message.includes('notes_fts'));
    });

    it('should NOT report extra-table-in-db for android_metadata', async () => {
      // Android's platform SQLite wrapper injects this table; users never
      // declare it in Dart and can't remove it.
      const ctx = createContext({
        dartFiles: [createDartFile('users', ['id', 'name'])],
        dbTables: [
          { name: 'users', columns: [
            { name: 'id', type: 'INTEGER', pk: true },
            { name: 'name', type: 'TEXT', pk: false },
          ], rowCount: 10 },
          { name: 'android_metadata', columns: [
            { name: 'locale', type: 'TEXT', pk: false },
          ], rowCount: 1 },
        ],
      });

      const issues = await provider.collectDiagnostics(ctx);

      const extraTableIssues = issues.filter((i) => i.code === 'extra-table-in-db');
      assert.strictEqual(
        extraTableIssues.length,
        0,
        'android_metadata should not produce extra-table-in-db',
      );
    });
  });

  describe('schema-version-mismatch', () => {
    it('should report when DB version differs from declared version', async () => {
      (workspace as any).workspaceFolders = [
        { uri: Uri.parse('file:///project'), name: 'project', index: 0 },
      ];

      const ctx = createContext({
        dartFiles: [createDartFile('users', ['id', 'name'])],
        dbTables: [{ name: 'users', columns: [
          { name: 'id', type: 'INTEGER', pk: true },
          { name: 'name', type: 'TEXT', pk: false },
        ], rowCount: 10 }],
      });
      (ctx.client as any).schemaVersionInfo = () => Promise.resolve({
        dbSchemaVersion: 3,
        declaredSchemaVersion: 5,
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'schema-version-mismatch');
      assert.ok(issue, 'Should report schema-version-mismatch');
      assert.ok(issue.message.includes('3'));
      assert.ok(issue.message.includes('5'));
      assert.strictEqual(issue.severity, DiagnosticSeverity.Error);
    });

    it('should not report when versions match', async () => {
      const ctx = createContext({
        dartFiles: [createDartFile('users', ['id', 'name'])],
        dbTables: [{ name: 'users', columns: [
          { name: 'id', type: 'INTEGER', pk: true },
          { name: 'name', type: 'TEXT', pk: false },
        ], rowCount: 10 }],
      });
      (ctx.client as any).schemaVersionInfo = () => Promise.resolve({
        dbSchemaVersion: 5,
        declaredSchemaVersion: 5,
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'schema-version-mismatch');
      assert.ok(!issue, 'Should NOT report when versions match');
    });

    it('should skip when version info is unavailable', async () => {
      const ctx = createContext({
        dartFiles: [createDartFile('users', ['id', 'name'])],
        dbTables: [{ name: 'users', columns: [
          { name: 'id', type: 'INTEGER', pk: true },
          { name: 'name', type: 'TEXT', pk: false },
        ], rowCount: 10 }],
      });
      (ctx.client as any).schemaVersionInfo = () => Promise.resolve({});

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'schema-version-mismatch');
      assert.ok(!issue, 'Should NOT report when version info is missing');
    });
  });
});
