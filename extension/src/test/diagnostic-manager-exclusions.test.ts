import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from './vscode-mock';
import {
  MockDiagnosticCollection,
} from './vscode-mock-classes';
import { resetMocks, workspace } from './vscode-mock';
import { DriftApiClient } from '../api-client';
import { SchemaIntelligence } from '../engines/schema-intelligence';
import { QueryIntelligence } from '../engines/query-intelligence';
import {
  DiagnosticManager,
} from '../diagnostics/diagnostic-manager';
import {
  type IDiagnosticIssue,
} from '../diagnostics/diagnostic-issue-types';
import { createMockProvider, createMockIssue } from './diagnostic-test-helpers';

describe('DiagnosticManager', () => {
  let client: DriftApiClient;
  let schemaIntel: SchemaIntelligence;
  let queryIntel: QueryIntelligence;
  let manager: DiagnosticManager;
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    fetchStub = sinon.stub(global, 'fetch');
    fetchStub.resolves(new Response(JSON.stringify([]), { status: 200 }));

    client = new DriftApiClient('127.0.0.1', 8642);
    schemaIntel = new SchemaIntelligence(client);
    queryIntel = new QueryIntelligence(client);
    manager = new DiagnosticManager(client, schemaIntel, queryIntel);

    resetMocks();
  });

  afterEach(() => {
    manager.dispose();
    sinon.restore();
  });

  describe('tableExclusions', () => {
    it('should suppress a rule on an excluded table', async () => {
      // Issue with data.tableName set — should be filtered out when
      // tableExclusions maps that rule to that table name.
      const issues: IDiagnosticIssue[] = [
        createMockIssue('no-foreign-keys', 'Table "users" has FK-like columns', 10, { tableName: 'users' }),
      ];

      manager.registerProvider(createMockProvider('bp', 'bestPractices', issues));

      // Stub config to exclude 'no-foreign-keys' on table 'users'
      sinon.stub(workspace, 'getConfiguration').returns({
        get: (key: string, defaultVal?: unknown) => {
          if (key === 'tableExclusions') {
            return { 'no-foreign-keys': ['users'] };
          }
          if (key === 'categories.bestPractices') return true;
          return defaultVal;
        },
      } as any);

      (manager as any)._lastRefresh = 0;
      await manager.refresh();

      const collection = manager.collection as unknown as MockDiagnosticCollection;
      const allDiags = [...collection.entries().values()].flat();

      // The issue should be filtered out because 'users' is excluded
      assert.strictEqual(allDiags.length, 0);
    });

    it('should NOT suppress a rule on a non-excluded table', async () => {
      // Same rule, but the table is not in the exclusion list
      const issues: IDiagnosticIssue[] = [
        createMockIssue('no-foreign-keys', 'Table "orders" has FK-like columns', 10, { tableName: 'orders' }),
      ];

      manager.registerProvider(createMockProvider('bp', 'bestPractices', issues));

      // Exclude only 'users', not 'orders'
      sinon.stub(workspace, 'getConfiguration').returns({
        get: (key: string, defaultVal?: unknown) => {
          if (key === 'tableExclusions') {
            return { 'no-foreign-keys': ['users'] };
          }
          if (key === 'categories.bestPractices') return true;
          return defaultVal;
        },
      } as any);

      (manager as any)._lastRefresh = 0;
      await manager.refresh();

      const collection = manager.collection as unknown as MockDiagnosticCollection;
      const allDiags = [...collection.entries().values()].flat();

      // 'orders' is not excluded, so the diagnostic should remain
      assert.strictEqual(allDiags.length, 1);
    });

    it('should not affect issues without data.tableName', async () => {
      // Issue with no data field — tableExclusions should not suppress it
      const issues: IDiagnosticIssue[] = [
        createMockIssue('missing-fk-index', 'FK column missing index', 10),
      ];

      manager.registerProvider(createMockProvider('schema', 'schema', issues));

      // Set up exclusions for missing-fk-index (but issue has no tableName)
      sinon.stub(workspace, 'getConfiguration').returns({
        get: (key: string, defaultVal?: unknown) => {
          if (key === 'tableExclusions') {
            return { 'missing-fk-index': ['users'] };
          }
          return defaultVal;
        },
      } as any);

      (manager as any)._lastRefresh = 0;
      await manager.refresh();

      const collection = manager.collection as unknown as MockDiagnosticCollection;
      const allDiags = [...collection.entries().values()].flat();

      // Issue has no tableName, so exclusion doesn't apply
      assert.strictEqual(allDiags.length, 1);
    });
  });

  describe('columnExclusions', () => {
    it('should suppress a rule on an excluded table.column', async () => {
      // high-null-rate issue carrying data.table + data.column — should be
      // filtered when columnExclusions maps the rule to "users.middle_name".
      const issues: IDiagnosticIssue[] = [
        createMockIssue('high-null-rate', 'Column "users.middle_name" has 94% NULL values', 10, {
          table: 'users',
          column: 'middle_name',
        }),
      ];

      manager.registerProvider(createMockProvider('dq', 'dataQuality', issues));

      sinon.stub(workspace, 'getConfiguration').returns({
        get: (key: string, defaultVal?: unknown) => {
          if (key === 'columnExclusions') {
            return { 'high-null-rate': ['users.middle_name'] };
          }
          if (key === 'categories.dataQuality') return true;
          return defaultVal;
        },
      } as any);

      (manager as any)._lastRefresh = 0;
      await manager.refresh();

      const collection = manager.collection as unknown as MockDiagnosticCollection;
      const allDiags = [...collection.entries().values()].flat();
      assert.strictEqual(allDiags.length, 0);
    });

    it('should NOT suppress the rule on a sibling column of the same table', async () => {
      // Same table, different column — the exclusion is column-scoped, so a
      // sibling column must still report.
      const issues: IDiagnosticIssue[] = [
        createMockIssue('high-null-rate', 'Column "users.nickname" has 80% NULL values', 10, {
          table: 'users',
          column: 'nickname',
        }),
      ];

      manager.registerProvider(createMockProvider('dq', 'dataQuality', issues));

      sinon.stub(workspace, 'getConfiguration').returns({
        get: (key: string, defaultVal?: unknown) => {
          if (key === 'columnExclusions') {
            return { 'high-null-rate': ['users.middle_name'] };
          }
          if (key === 'categories.dataQuality') return true;
          return defaultVal;
        },
      } as any);

      (manager as any)._lastRefresh = 0;
      await manager.refresh();

      const collection = manager.collection as unknown as MockDiagnosticCollection;
      const allDiags = [...collection.entries().values()].flat();
      assert.strictEqual(allDiags.length, 1);
    });
  });
});
