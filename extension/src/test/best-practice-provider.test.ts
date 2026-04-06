/**
 * Diagnostic-collection tests for `BestPracticeProvider`.
 *
 * Code-action tests live in `best-practice-provider-actions.test.ts`.
 * The shared `createContext` helper lives in
 * `best-practice-provider-test-helpers.ts`.
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import {
  DiagnosticSeverity,
} from './vscode-mock-classes';
import { resetMocks } from './vscode-mock';
import { BestPracticeProvider } from '../diagnostics/providers/best-practice-provider';
import { createDartFile } from './diagnostic-test-helpers';
import { createContext } from './best-practice-provider-test-helpers';

describe('BestPracticeProvider', () => {
  let provider: BestPracticeProvider;
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    fetchStub = sinon.stub(global, 'fetch');
    fetchStub.resolves(new Response(JSON.stringify([]), { status: 200 }));

    provider = new BestPracticeProvider();
    resetMocks();
  });

  afterEach(() => {
    provider.dispose();
    sinon.restore();
  });

  describe('collectDiagnostics', () => {
    it('should report autoincrement-not-pk when autoIncrement is not on PK', async () => {
      const dartFile = createDartFile('counters', ['id', 'value']);
      dartFile.tables[0].columns[1].autoIncrement = true;

      const ctx = createContext({
        dartFiles: [dartFile],
        tables: [{
          name: 'counters',
          columns: [
            { name: 'id', type: 'INTEGER', pk: true },
            { name: 'value', type: 'INTEGER', pk: false },
          ],
          rowCount: 10,
        }],
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'autoincrement-not-pk');
      assert.ok(issue, 'Should report autoincrement-not-pk');
      assert.ok(issue.message.includes('value'));
      assert.strictEqual(issue.severity, DiagnosticSeverity.Error);
    });

    it('should not report autoincrement-not-pk when autoIncrement is on PK', async () => {
      const dartFile = createDartFile('users', ['id', 'name']);

      const ctx = createContext({
        dartFiles: [dartFile],
        tables: [{
          name: 'users',
          columns: [
            { name: 'id', type: 'INTEGER', pk: true },
            { name: 'name', type: 'TEXT', pk: false },
          ],
          rowCount: 10,
        }],
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'autoincrement-not-pk');
      assert.ok(!issue, 'Should not report when autoIncrement is on PK');
    });

    it('should not report no-foreign-keys for intentionally isolated tables', async () => {
      // Tables like settings/config have no _id columns referencing other tables,
      // so they should NOT be flagged — the absence of FKs is intentional
      const ctx = createContext({
        dartFiles: [createDartFile('settings', ['id', 'key', 'value'])],
        tables: [{
          name: 'settings',
          columns: [
            { name: 'id', type: 'INTEGER', pk: true },
            { name: 'key', type: 'TEXT', pk: false },
            { name: 'value', type: 'TEXT', pk: false },
          ],
          rowCount: 5,
        }],
        fkMap: { settings: [] },
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'no-foreign-keys');
      assert.ok(!issue, 'Should not report for intentionally isolated tables');
    });

    it('should report no-foreign-keys when _id columns match known tables but lack FK constraints', async () => {
      // orders.user_id looks like it should reference the users table,
      // but no FK constraint exists — this is likely a missing references() call
      const ctx = createContext({
        dartFiles: [createDartFile('orders', ['id', 'user_id'])],
        tables: [
          { name: 'orders', columns: [{ name: 'id', type: 'INTEGER', pk: true }, { name: 'user_id', type: 'INTEGER', pk: false }], rowCount: 100 },
          { name: 'users', columns: [{ name: 'id', type: 'INTEGER', pk: true }], rowCount: 50 },
        ],
        fkMap: { orders: [], users: [] },
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'no-foreign-keys');
      assert.ok(issue, 'Should report when _id columns match known tables');
      assert.ok(issue.message.includes('user_id'), 'Message should name the suspected column');
      assert.strictEqual(issue.severity, DiagnosticSeverity.Information);
    });

    it('should not report no-foreign-keys for tables with outbound FKs', async () => {
      const ctx = createContext({
        dartFiles: [createDartFile('orders', ['id', 'user_id'])],
        tables: [
          { name: 'orders', columns: [{ name: 'id', type: 'INTEGER', pk: true }, { name: 'user_id', type: 'INTEGER', pk: false }], rowCount: 100 },
          { name: 'users', columns: [{ name: 'id', type: 'INTEGER', pk: true }], rowCount: 50 },
        ],
        fkMap: {
          orders: [{ fromColumn: 'user_id', toTable: 'users', toColumn: 'id' }],
          users: [],
        },
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'no-foreign-keys');
      assert.ok(!issue, 'Should not report when outbound FKs exist');
    });

    it('should not report no-foreign-keys for tables referenced by other tables (inbound FKs)', async () => {
      // Parent/lookup tables are referenced by others — they participate in the
      // FK graph even though they declare no outbound FKs themselves
      const ctx = createContext({
        dartFiles: [
          createDartFile('users', ['id', 'name']),
          createDartFile('orders', ['id', 'user_id']),
        ],
        tables: [
          { name: 'users', columns: [{ name: 'id', type: 'INTEGER', pk: true }, { name: 'name', type: 'TEXT', pk: false }], rowCount: 50 },
          { name: 'orders', columns: [{ name: 'id', type: 'INTEGER', pk: true }, { name: 'user_id', type: 'INTEGER', pk: false }], rowCount: 100 },
        ],
        fkMap: {
          users: [],
          orders: [{ fromColumn: 'user_id', toTable: 'users', toColumn: 'id' }],
        },
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'no-foreign-keys');
      assert.ok(!issue, 'Should not report for tables with inbound FK references');
    });

    it('should not report no-foreign-keys when _id columns reference external systems', async () => {
      // facebook_id is an external identifier, not a reference to a "facebook" table.
      // No table named "facebook" or "facebooks" exists, so this should be skipped.
      const ctx = createContext({
        dartFiles: [createDartFile('facebook_friends', ['id', 'facebook_id', 'given_name'])],
        tables: [{
          name: 'facebook_friends',
          columns: [
            { name: 'id', type: 'INTEGER', pk: true },
            { name: 'facebook_id', type: 'TEXT', pk: false },
            { name: 'given_name', type: 'TEXT', pk: false },
          ],
          rowCount: 200,
        }],
        fkMap: { facebook_friends: [] },
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'no-foreign-keys');
      assert.ok(!issue, 'Should not report when _id columns do not match any known table');
    });

    it('should match _id columns against singular table names', async () => {
      // "user_id" should match a table literally named "user" (no plural 's')
      const ctx = createContext({
        dartFiles: [createDartFile('posts', ['id', 'user_id', 'title'])],
        tables: [
          { name: 'posts', columns: [{ name: 'id', type: 'INTEGER', pk: true }, { name: 'user_id', type: 'INTEGER', pk: false }, { name: 'title', type: 'TEXT', pk: false }], rowCount: 50 },
          { name: 'user', columns: [{ name: 'id', type: 'INTEGER', pk: true }], rowCount: 10 },
        ],
        fkMap: { posts: [], user: [] },
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'no-foreign-keys');
      assert.ok(issue, 'Should match user_id against singular table "user"');
      assert.ok(issue.message.includes('user_id'));
    });

    it('should match _id columns against irregular plural table names (ies)', async () => {
      // "category_id" should match a table named "categories" via ies→y transform
      const ctx = createContext({
        dartFiles: [createDartFile('products', ['id', 'category_id'])],
        tables: [
          { name: 'products', columns: [{ name: 'id', type: 'INTEGER', pk: true }, { name: 'category_id', type: 'INTEGER', pk: false }], rowCount: 100 },
          { name: 'categories', columns: [{ name: 'id', type: 'INTEGER', pk: true }], rowCount: 20 },
        ],
        fkMap: { products: [], categories: [] },
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'no-foreign-keys');
      assert.ok(issue, 'Should match category_id against "categories" table');
      assert.ok(issue.message.includes('category_id'));
    });

    it('should not report blob-column-large for BLOB columns (removed — too noisy)', async () => {
      // BLOB columns are intentional developer choices; flagging them by type
      // alone adds no actionable information and clutters the Problems panel
      const dartFile = createDartFile('documents', ['id', 'content']);
      dartFile.tables[0].columns[1].dartType = 'BlobColumn';

      const ctx = createContext({
        dartFiles: [dartFile],
        tables: [{
          name: 'documents',
          columns: [
            { name: 'id', type: 'INTEGER', pk: true },
            { name: 'content', type: 'BLOB', pk: false },
          ],
          rowCount: 10,
        }],
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'blob-column-large');
      assert.ok(!issue, 'Should not report blob-column-large');
    });

    it('should report circular-fk for circular relationships', async () => {
      const ctx = createContext({
        dartFiles: [
          createDartFile('a', ['id', 'b_id']),
          createDartFile('b', ['id', 'a_id']),
        ],
        tables: [
          { name: 'a', columns: [{ name: 'id', type: 'INTEGER', pk: true }], rowCount: 10 },
          { name: 'b', columns: [{ name: 'id', type: 'INTEGER', pk: true }], rowCount: 10 },
        ],
        fkMap: {
          a: [{ fromColumn: 'b_id', toTable: 'b', toColumn: 'id' }],
          b: [{ fromColumn: 'a_id', toTable: 'a', toColumn: 'id' }],
        },
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'circular-fk');
      assert.ok(issue, 'Should report circular-fk');
      assert.ok(issue.message.includes('→'));
      assert.strictEqual(issue.severity, DiagnosticSeverity.Warning);
    });

    it('should return empty array when server is unreachable', async () => {
      const ctx = createContext({ dartFiles: [], tables: [] });
      (ctx.client.schemaMetadata as any) = () => Promise.reject(new Error('Server down'));

      const issues = await provider.collectDiagnostics(ctx);

      assert.strictEqual(issues.length, 0);
    });
  });
});
