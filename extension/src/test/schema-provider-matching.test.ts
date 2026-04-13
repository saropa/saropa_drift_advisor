/**
 * Schema provider tests — Part 2: Name matching, anomalies, and edge cases.
 * Covers orphaned-fk, extra-table-in-db,
 * acronym mismatch, exact-match guard, and server-unreachable empty results.
 * See also: schema-provider.test.ts (basic checks), schema-provider-actions.test.ts
 */
import * as assert from 'assert';
import * as sinon from 'sinon';
import {
  DiagnosticSeverity,
} from './vscode-mock-classes';
import { resetMocks } from './vscode-mock';
import { DriftApiClient } from '../api-client';
import { SchemaIntelligence } from '../engines/schema-intelligence';
import { SchemaProvider } from '../diagnostics/providers/schema-provider';
import { createDartFile } from './diagnostic-test-helpers';
import { createContext } from './schema-provider-test-helpers';

describe('SchemaProvider', () => {
  /** Shared test fixtures — recreated before every test for isolation. */
  let client: DriftApiClient;
  let schemaIntel: SchemaIntelligence;
  let provider: SchemaProvider;
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    // Stub global fetch so no real HTTP requests escape during tests.
    fetchStub = sinon.stub(global, 'fetch');
    fetchStub.resolves(new Response(JSON.stringify([]), { status: 200 }));

    // Client and schemaIntel are needed for the "server unreachable" test
    // which stubs schemaIntel.getInsights to simulate a network failure.
    client = new DriftApiClient('127.0.0.1', 8642);
    schemaIntel = new SchemaIntelligence(client);
    provider = new SchemaProvider();

    resetMocks();
  });

  afterEach(() => {
    provider.dispose();
    sinon.restore();
  });

  describe('collectDiagnostics — matching and anomalies', () => {
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
});
