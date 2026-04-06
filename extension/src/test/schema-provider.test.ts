import * as assert from 'assert';
import * as sinon from 'sinon';
import {
  CodeAction,
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
import { SchemaProvider } from '../diagnostics/providers/schema-provider';
import type { IDartFileInfo } from '../diagnostics/diagnostic-types';
import { createDartFile } from './diagnostic-test-helpers';
import { createContext } from './schema-provider-test-helpers';

describe('SchemaProvider', () => {
  let client: DriftApiClient;
  let schemaIntel: SchemaIntelligence;
  let queryIntel: QueryIntelligence;
  let provider: SchemaProvider;
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    fetchStub = sinon.stub(global, 'fetch');
    fetchStub.resolves(new Response(JSON.stringify([]), { status: 200 }));

    client = new DriftApiClient('127.0.0.1', 8642);
    schemaIntel = new SchemaIntelligence(client);
    queryIntel = new QueryIntelligence(client);
    provider = new SchemaProvider();

    resetMocks();
  });

  afterEach(() => {
    provider.dispose();
    sinon.restore();
  });

  describe('collectDiagnostics', () => {
    it('should report missing-table-in-db when Dart table not in database', async () => {
      const ctx = createContext({
        dartFiles: [createDartFile('users', ['id', 'name'])],
        dbTables: [], // Empty database
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'missing-table-in-db');
      assert.ok(issue, 'Should report missing-table-in-db');
      assert.ok(issue.message.includes('users'));
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

    it('should report missing-datetime-index for low-priority datetime suggestions', async () => {
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

      const issue = issues.find((i) => i.code === 'missing-datetime-index');
      assert.ok(issue, 'Should report missing-datetime-index');
      assert.ok(issue.message.includes('created_at'));
      assert.ok(issue.message.includes('Date/time'));
      assert.strictEqual(issue.severity, DiagnosticSeverity.Hint);
      // Must NOT use the FK label
      assert.ok(!issue.message.includes('FK column'));
    });

    it('should NOT label datetime columns as FK columns', async () => {
      const ctx = createContext({
        dartFiles: [createDartFile('keys', ['id', 'updated_at'])],
        dbTables: [{ name: 'keys', columns: [
          { name: 'id', type: 'INTEGER', pk: true },
          { name: 'updated_at', type: 'INTEGER', pk: false },
        ], rowCount: 1 }],
        indexSuggestions: [{
          table: 'keys',
          column: 'updated_at',
          reason: 'Date/time column — often used in ORDER BY or range queries',
          sql: 'CREATE INDEX idx_keys_updated_at ON keys(updated_at)',
          priority: 'low',
        }],
      });

      const issues = await provider.collectDiagnostics(ctx);

      // No issue should use the missing-fk-index code
      const fkIssues = issues.filter((i) => i.code === 'missing-fk-index');
      assert.strictEqual(fkIssues.length, 0, 'Datetime columns must not produce missing-fk-index');
    });

    it('should skip datetime suggestion for BoolColumn (is_free_time)', async () => {
      // is_free_time ends in "time" and triggers the server's datetime
      // heuristic, but it is actually a BoolColumn. The extension-side
      // filter should suppress it.
      const dartFile = createDartFile('calendar_events', ['id', 'title']);
      // Manually add a BoolColumn named is_free_time to the dart file.
      dartFile.tables[0].columns.push({
        dartName: 'isFreeTime',
        sqlName: 'is_free_time',
        dartType: 'BoolColumn',
        sqlType: 'INTEGER',
        nullable: true,
        autoIncrement: false,
        line: 15,
      });

      const ctx = createContext({
        dartFiles: [dartFile],
        dbTables: [{ name: 'calendar_events', columns: [
          { name: 'id', type: 'INTEGER', pk: true },
          { name: 'title', type: 'TEXT', pk: false },
          { name: 'is_free_time', type: 'INTEGER', pk: false },
        ], rowCount: 100 }],
        indexSuggestions: [{
          table: 'calendar_events',
          column: 'is_free_time',
          reason: 'Date/time column — often used in ORDER BY or range queries',
          sql: 'CREATE INDEX idx_calendar_events_is_free_time ON calendar_events(is_free_time)',
          priority: 'low',
        }],
      });

      const issues = await provider.collectDiagnostics(ctx);

      // BoolColumn should NOT produce a datetime index suggestion.
      const dtIssue = issues.find((i) => i.code === 'missing-datetime-index');
      assert.strictEqual(dtIssue, undefined,
        'BoolColumn is_free_time must not trigger missing-datetime-index');
    });

    it('should report orphaned-fk from anomalies', async () => {
      const ctx = createContext({
        dartFiles: [createDartFile('orders', ['id', 'user_id'])],
        dbTables: [{ name: 'orders', columns: [
          { name: 'id', type: 'INTEGER', pk: true },
          { name: 'user_id', type: 'INTEGER', pk: false },
        ], rowCount: 100 }],
        anomalies: [{
          message: '5 orphaned FK values in orders.user_id',
          severity: 'error',
        }],
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'orphaned-fk');
      assert.ok(issue, 'Should report orphaned-fk');
      assert.strictEqual(issue.severity, DiagnosticSeverity.Error);
    });

    it('should report extra-table-in-db for genuinely orphaned DB tables', async () => {
      const ctx = createContext({
        dartFiles: [createDartFile('users', ['id', 'name'])],
        dbTables: [
          { name: 'users', columns: [
            { name: 'id', type: 'INTEGER', pk: true },
            { name: 'name', type: 'TEXT', pk: false },
          ], rowCount: 10 },
          { name: 'legacy_archive', columns: [
            { name: 'id', type: 'INTEGER', pk: true },
          ], rowCount: 0 },
        ],
      });

      const issues = await provider.collectDiagnostics(ctx);

      const extraIssue = issues.find((i) => i.code === 'extra-table-in-db');
      assert.ok(extraIssue, 'Should report extra-table-in-db for genuinely orphaned table');
      assert.ok(extraIssue!.message.includes('legacy_archive'));
    });

    it('should NOT report extra-table-in-db when DB name differs only by acronym underscores', async () => {
      // Dart class "SuperheroDCCharacters" produces sqlTableName "superhero_d_c_characters"
      // but the pre-built DB has "superhero_dc_characters" (no underscore between D and C).
      // The checker should recognize these as the same table.
      const dartFile = createDartFile('superhero_d_c_characters', ['id', 'name']);
      const ctx = createContext({
        dartFiles: [dartFile],
        dbTables: [{
          name: 'superhero_dc_characters',
          columns: [
            { name: 'id', type: 'INTEGER', pk: true },
            { name: 'name', type: 'TEXT', pk: false },
          ],
          rowCount: 50,
        }],
      });

      const issues = await provider.collectDiagnostics(ctx);

      // Should NOT fire extra-table-in-db for the DB table
      const extraIssue = issues.find((i) => i.code === 'extra-table-in-db');
      assert.strictEqual(extraIssue, undefined, 'Should not report extra-table-in-db for acronym underscore difference');

      // Should NOT fire missing-table-in-db for the Dart table either
      const missingIssue = issues.find((i) => i.code === 'missing-table-in-db');
      assert.strictEqual(missingIssue, undefined, 'Should not report missing-table-in-db for acronym underscore difference');
    });

    it('should report column-name-acronym-mismatch when column names differ only by acronym underscores', async () => {
      // Dart getter "contactSaropaUUID" produces sqlName "contact_saropa_u_u_i_d"
      // but the DB has "contact_saropa_uuid". Normalized comparison should detect this.
      const dartFile = createDartFile('reactions', ['id']);
      dartFile.tables[0].columns.push({
        dartName: 'contactSaropaUuid',
        sqlName: 'contact_saropa_u_u_i_d',
        dartType: 'TextColumn',
        sqlType: 'TEXT',
        nullable: false,
        autoIncrement: false,
        line: 15,
      });

      const ctx = createContext({
        dartFiles: [dartFile],
        dbTables: [{
          name: 'reactions',
          columns: [
            { name: 'id', type: 'INTEGER', pk: true },
            { name: 'contact_saropa_uuid', type: 'TEXT', pk: false },
          ],
          rowCount: 10,
        }],
      });

      const issues = await provider.collectDiagnostics(ctx);

      // Should report acronym mismatch, NOT missing-column + extra-column
      const mismatch = issues.find((i) => i.code === 'column-name-acronym-mismatch');
      assert.ok(mismatch, 'Should report column-name-acronym-mismatch');
      assert.ok(mismatch.message.includes('contact_saropa_u_u_i_d'));
      assert.ok(mismatch.message.includes('contact_saropa_uuid'));
      assert.ok(mismatch.message.includes('.named('));
      assert.strictEqual(mismatch.severity, DiagnosticSeverity.Error);

      // Must NOT produce the split diagnostics
      const missing = issues.find(
        (i) => i.code === 'missing-column-in-db' && i.message.includes('contact_saropa'),
      );
      assert.strictEqual(missing, undefined, 'Should not report missing-column-in-db for acronym mismatch');

      const extra = issues.find(
        (i) => i.code === 'extra-column-in-db' && i.message.includes('contact_saropa'),
      );
      assert.strictEqual(extra, undefined, 'Should not report extra-column-in-db for acronym mismatch');
    });

    it('should NOT report acronym mismatch when column names match exactly', async () => {
      // Regression guard: exact matches must take priority over normalized matching.
      // "contact_saropa_uuid" in Dart + "contact_saropa_uuid" in DB = perfect match.
      const dartFile = createDartFile('reactions', ['id']);
      dartFile.tables[0].columns.push({
        dartName: 'contactSaropaUuid',
        sqlName: 'contact_saropa_uuid',
        dartType: 'TextColumn',
        sqlType: 'TEXT',
        nullable: false,
        autoIncrement: false,
        line: 15,
      });

      const ctx = createContext({
        dartFiles: [dartFile],
        dbTables: [{
          name: 'reactions',
          columns: [
            { name: 'id', type: 'INTEGER', pk: true },
            { name: 'contact_saropa_uuid', type: 'TEXT', pk: false },
          ],
          rowCount: 10,
        }],
      });

      const issues = await provider.collectDiagnostics(ctx);

      // No column drift diagnostics of any kind — everything matches
      const mismatch = issues.find((i) => i.code === 'column-name-acronym-mismatch');
      assert.strictEqual(mismatch, undefined, 'Exact match must not trigger acronym mismatch');

      const missing = issues.find((i) => i.code === 'missing-column-in-db');
      assert.strictEqual(missing, undefined, 'Exact match must not trigger missing-column');

      const extra = issues.find((i) => i.code === 'extra-column-in-db');
      assert.strictEqual(extra, undefined, 'Exact match must not trigger extra-column');
    });

    it('should still report missing + extra when columns are genuinely different', async () => {
      const ctx = createContext({
        dartFiles: [createDartFile('users', ['id', 'email'])],
        dbTables: [{
          name: 'users',
          columns: [
            { name: 'id', type: 'INTEGER', pk: true },
            { name: 'phone', type: 'TEXT', pk: false },
          ],
          rowCount: 10,
        }],
      });

      const issues = await provider.collectDiagnostics(ctx);

      // These are genuinely different columns — no acronym mismatch
      const mismatch = issues.find((i) => i.code === 'column-name-acronym-mismatch');
      assert.strictEqual(mismatch, undefined, 'Should not report acronym mismatch for genuinely different columns');

      const missing = issues.find((i) => i.code === 'missing-column-in-db');
      assert.ok(missing, 'Should report missing-column-in-db for email');

      const extra = issues.find((i) => i.code === 'extra-column-in-db');
      assert.ok(extra, 'Should report extra-column-in-db for phone');
    });

    it('should return empty array when server is unreachable', async () => {
      sinon.stub(schemaIntel, 'getInsights').rejects(new Error('Server down'));

      const ctx = createContext({ dartFiles: [], dbTables: [] });
      const issues = await provider.collectDiagnostics(ctx);

      assert.strictEqual(issues.length, 0);
    });
  });

  describe('provideCodeActions', () => {
    it('should provide Copy action for missing-fk-index', () => {
      const diag = new Diagnostic(
        new Range(10, 0, 10, 100),
        '[drift_advisor] FK column lacks index',
        DiagnosticSeverity.Warning,
      );
      diag.code = 'missing-fk-index';
      diag.relatedInformation = [
        new DiagnosticRelatedInformation(
          new Location(
            Uri.parse('file:///test.dart'),
            new Range(10, 0, 10, 100),
          ),
          'Suggested: CREATE INDEX idx_test ON test(col)',
        ),
      ];

      const actions = provider.provideCodeActions(diag as any, {} as any);

      assert.strictEqual(actions.length, 1);
      assert.ok(actions.some((a) => a.title.includes('Copy')));
      // "Run CREATE INDEX Now" was removed — server is read-only
      assert.ok(!actions.some((a) => a.title.includes('Run')));
      assert.ok(actions[0].isPreferred, 'Copy action should be preferred');
    });

    it('should provide Copy action for missing-id-index', () => {
      const diag = new Diagnostic(
        new Range(10, 0, 10, 100),
        '[drift_advisor] Column ends in _id',
        DiagnosticSeverity.Hint,
      );
      diag.code = 'missing-id-index';
      diag.relatedInformation = [
        new DiagnosticRelatedInformation(
          new Location(
            Uri.parse('file:///test.dart'),
            new Range(10, 0, 10, 100),
          ),
          'Suggested: CREATE INDEX idx_orders_customer_id ON orders(customer_id)',
        ),
      ];

      const actions = provider.provideCodeActions(diag as any, {} as any);

      assert.strictEqual(actions.length, 1);
      assert.ok(actions.some((a) => a.title.includes('Copy')));
    });

    it('should provide Copy action for missing-datetime-index', () => {
      const diag = new Diagnostic(
        new Range(10, 0, 10, 100),
        '[drift_advisor] Date/time column may benefit from index',
        DiagnosticSeverity.Hint,
      );
      diag.code = 'missing-datetime-index';
      diag.relatedInformation = [
        new DiagnosticRelatedInformation(
          new Location(
            Uri.parse('file:///test.dart'),
            new Range(10, 0, 10, 100),
          ),
          'Suggested: CREATE INDEX idx_users_created_at ON users(created_at)',
        ),
      ];

      const actions = provider.provideCodeActions(diag as any, {} as any);

      assert.strictEqual(actions.length, 1);
      assert.ok(actions.some((a) => a.title.includes('Copy')));
    });

    it('should provide Schema Diff action for column-name-acronym-mismatch', () => {
      const diag = new Diagnostic(
        new Range(15, 0, 15, 100),
        '[drift_advisor] Column name mismatch due to acronym splitting',
        DiagnosticSeverity.Error,
      );
      diag.code = 'column-name-acronym-mismatch';

      const actions = provider.provideCodeActions(diag as any, {} as any);

      assert.ok(actions.some((a) => a.title.includes('Schema Diff')));
      assert.ok(actions[0].isPreferred, 'Schema Diff action should be preferred');
    });

    it('should provide migration actions for missing-column-in-db', () => {
      const diag = new Diagnostic(
        new Range(10, 0, 10, 100),
        '[drift_advisor] Column missing',
        DiagnosticSeverity.Error,
      );
      diag.code = 'missing-column-in-db';

      const actions = provider.provideCodeActions(diag as any, {} as any);

      assert.ok(actions.some((a) => a.title.includes('Generate Migration')));
      assert.ok(actions.some((a) => a.title.includes('Schema Diff')));
    });

    it('should provide View Anomaly action for orphaned-fk', () => {
      const diag = new Diagnostic(
        new Range(10, 0, 10, 100),
        '[drift_advisor] Orphaned FK',
        DiagnosticSeverity.Error,
      );
      diag.code = 'orphaned-fk';

      const actions = provider.provideCodeActions(diag as any, {} as any);

      assert.ok(actions.some((a) => a.title.includes('Anomaly Panel')));
    });
  });
});

