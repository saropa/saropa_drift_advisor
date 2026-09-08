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

  describe('columnNameExclusions', () => {
    it('should suppress a rule on a bare column name regardless of table', async () => {
      // lastModified is nullable by design on every table that carries it —
      // columnNameExclusions matches by column name alone, no table qualifier.
      const issues: IDiagnosticIssue[] = [
        createMockIssue('high-null-rate', 'Column "activities.lastModified" has 91% NULL values', 10, {
          table: 'activities',
          column: 'lastModified',
        }),
        createMockIssue('high-null-rate', 'Column "contacts.lastModified" has 88% NULL values', 20, {
          table: 'contacts',
          column: 'lastModified',
        }),
      ];

      manager.registerProvider(createMockProvider('dq', 'dataQuality', issues));

      sinon.stub(workspace, 'getConfiguration').returns({
        get: (key: string, defaultVal?: unknown) => {
          if (key === 'columnNameExclusions') {
            return { 'high-null-rate': ['lastModified'] };
          }
          if (key === 'categories.dataQuality') return true;
          return defaultVal;
        },
      } as any);

      (manager as any)._lastRefresh = 0;
      await manager.refresh();

      const collection = manager.collection as unknown as MockDiagnosticCollection;
      const allDiags = [...collection.entries().values()].flat();
      assert.strictEqual(allDiags.length, 0, 'lastModified should be suppressed on every table');
    });

    it('should match case-insensitively', async () => {
      const issues: IDiagnosticIssue[] = [
        createMockIssue('high-null-rate', 'Column "activities.LastModified" has 91% NULL values', 10, {
          table: 'activities',
          column: 'LastModified',
        }),
      ];

      manager.registerProvider(createMockProvider('dq', 'dataQuality', issues));

      sinon.stub(workspace, 'getConfiguration').returns({
        get: (key: string, defaultVal?: unknown) => {
          if (key === 'columnNameExclusions') {
            return { 'high-null-rate': ['lastmodified'] };
          }
          if (key === 'categories.dataQuality') return true;
          return defaultVal;
        },
      } as any);

      (manager as any)._lastRefresh = 0;
      await manager.refresh();

      const collection = manager.collection as unknown as MockDiagnosticCollection;
      const allDiags = [...collection.entries().values()].flat();
      assert.strictEqual(allDiags.length, 0, 'match should be case-insensitive');
    });

    it('should suppress a column-only issue that carries no table/tableName', async () => {
      // Regression guard: the column-name check must not depend on the
      // presence of data.table/tableName, so a future provider that reports
      // data.column alone is still suppressible.
      const issues: IDiagnosticIssue[] = [
        createMockIssue('high-null-rate', 'Column "lastModified" has 91% NULL values', 10, {
          column: 'lastModified',
        }),
      ];

      manager.registerProvider(createMockProvider('dq', 'dataQuality', issues));

      sinon.stub(workspace, 'getConfiguration').returns({
        get: (key: string, defaultVal?: unknown) => {
          if (key === 'columnNameExclusions') {
            return { 'high-null-rate': ['lastModified'] };
          }
          if (key === 'categories.dataQuality') return true;
          return defaultVal;
        },
      } as any);

      (manager as any)._lastRefresh = 0;
      await manager.refresh();

      const collection = manager.collection as unknown as MockDiagnosticCollection;
      const allDiags = [...collection.entries().values()].flat();
      assert.strictEqual(allDiags.length, 0, 'column-only issue should still be suppressed by column name');
    });

    it('should NOT suppress a differently-named column', async () => {
      const issues: IDiagnosticIssue[] = [
        createMockIssue('high-null-rate', 'Column "users.nickname" has 80% NULL values', 10, {
          table: 'users',
          column: 'nickname',
        }),
      ];

      manager.registerProvider(createMockProvider('dq', 'dataQuality', issues));

      sinon.stub(workspace, 'getConfiguration').returns({
        get: (key: string, defaultVal?: unknown) => {
          if (key === 'columnNameExclusions') {
            return { 'high-null-rate': ['lastModified'] };
          }
          if (key === 'categories.dataQuality') return true;
          return defaultVal;
        },
      } as any);

      (manager as any)._lastRefresh = 0;
      await manager.refresh();

      const collection = manager.collection as unknown as MockDiagnosticCollection;
      const allDiags = [...collection.entries().values()].flat();
      assert.strictEqual(allDiags.length, 1, 'unrelated column name must not be suppressed');
    });

    it('should suppress every column matching a "*" glob pattern', async () => {
      // "*_at" should catch created_at, updated_at, deleted_at — the common
      // timestamp-suffix family — without listing each one individually.
      const issues: IDiagnosticIssue[] = [
        createMockIssue('high-null-rate', 'Column "activities.deleted_at" has 97% NULL values', 10, {
          table: 'activities',
          column: 'deleted_at',
        }),
        createMockIssue('high-null-rate', 'Column "contacts.created_at" has 5% NULL values', 20, {
          table: 'contacts',
          column: 'created_at',
        }),
      ];

      manager.registerProvider(createMockProvider('dq', 'dataQuality', issues));

      sinon.stub(workspace, 'getConfiguration').returns({
        get: (key: string, defaultVal?: unknown) => {
          if (key === 'columnNameExclusions') {
            return { 'high-null-rate': ['*_at'] };
          }
          if (key === 'categories.dataQuality') return true;
          return defaultVal;
        },
      } as any);

      (manager as any)._lastRefresh = 0;
      await manager.refresh();

      const collection = manager.collection as unknown as MockDiagnosticCollection;
      const allDiags = [...collection.entries().values()].flat();
      assert.strictEqual(allDiags.length, 0, 'every *_at column should be suppressed by the glob pattern');
    });

    it('should NOT suppress a column that does not match the glob pattern', async () => {
      const issues: IDiagnosticIssue[] = [
        createMockIssue('high-null-rate', 'Column "users.nickname" has 80% NULL values', 10, {
          table: 'users',
          column: 'nickname',
        }),
      ];

      manager.registerProvider(createMockProvider('dq', 'dataQuality', issues));

      sinon.stub(workspace, 'getConfiguration').returns({
        get: (key: string, defaultVal?: unknown) => {
          if (key === 'columnNameExclusions') {
            return { 'high-null-rate': ['*_at'] };
          }
          if (key === 'categories.dataQuality') return true;
          return defaultVal;
        },
      } as any);

      (manager as any)._lastRefresh = 0;
      await manager.refresh();

      const collection = manager.collection as unknown as MockDiagnosticCollection;
      const allDiags = [...collection.entries().values()].flat();
      assert.strictEqual(allDiags.length, 1, 'non-matching column must not be suppressed by the glob');
    });

    it('should match a glob pattern case-insensitively', async () => {
      const issues: IDiagnosticIssue[] = [
        createMockIssue('high-null-rate', 'Column "activities.DeletedAt" has 97% NULL values', 10, {
          table: 'activities',
          column: 'DeletedAt',
        }),
      ];

      manager.registerProvider(createMockProvider('dq', 'dataQuality', issues));

      sinon.stub(workspace, 'getConfiguration').returns({
        get: (key: string, defaultVal?: unknown) => {
          if (key === 'columnNameExclusions') {
            return { 'high-null-rate': ['*at'] };
          }
          if (key === 'categories.dataQuality') return true;
          return defaultVal;
        },
      } as any);

      (manager as any)._lastRefresh = 0;
      await manager.refresh();

      const collection = manager.collection as unknown as MockDiagnosticCollection;
      const allDiags = [...collection.entries().values()].flat();
      assert.strictEqual(allDiags.length, 0, 'glob match should be case-insensitive');
    });

    it('should suppress a column matching a trailing-only "prefix*" glob pattern', async () => {
      const issues: IDiagnosticIssue[] = [
        createMockIssue('high-null-rate', 'Column "activities.tempSyncFlag" has 60% NULL values', 10, {
          table: 'activities',
          column: 'tempSyncFlag',
        }),
        createMockIssue('high-null-rate', 'Column "users.nickname" has 60% NULL values', 20, {
          table: 'users',
          column: 'nickname',
        }),
      ];

      manager.registerProvider(createMockProvider('dq', 'dataQuality', issues));

      sinon.stub(workspace, 'getConfiguration').returns({
        get: (key: string, defaultVal?: unknown) => {
          if (key === 'columnNameExclusions') {
            return { 'high-null-rate': ['temp*'] };
          }
          if (key === 'categories.dataQuality') return true;
          return defaultVal;
        },
      } as any);

      (manager as any)._lastRefresh = 0;
      await manager.refresh();

      const collection = manager.collection as unknown as MockDiagnosticCollection;
      const allDiags = [...collection.entries().values()].flat();
      assert.strictEqual(allDiags.length, 1, 'only the non-matching column should remain');
      assert.match(allDiags[0].message, /nickname/, 'the surviving diagnostic should be the unrelated column');
    });

    it('should suppress a column matching a leading-and-trailing "*mid*" glob pattern', async () => {
      const issues: IDiagnosticIssue[] = [
        createMockIssue('high-null-rate', 'Column "activities.legacyMiddleName" has 60% NULL values', 10, {
          table: 'activities',
          column: 'legacyMiddleName',
        }),
        createMockIssue('high-null-rate', 'Column "users.nickname" has 60% NULL values', 20, {
          table: 'users',
          column: 'nickname',
        }),
      ];

      manager.registerProvider(createMockProvider('dq', 'dataQuality', issues));

      sinon.stub(workspace, 'getConfiguration').returns({
        get: (key: string, defaultVal?: unknown) => {
          if (key === 'columnNameExclusions') {
            return { 'high-null-rate': ['*middle*'] };
          }
          if (key === 'categories.dataQuality') return true;
          return defaultVal;
        },
      } as any);

      (manager as any)._lastRefresh = 0;
      await manager.refresh();

      const collection = manager.collection as unknown as MockDiagnosticCollection;
      const allDiags = [...collection.entries().values()].flat();
      assert.strictEqual(allDiags.length, 1, 'only the non-matching column should remain');
      assert.match(allDiags[0].message, /nickname/, 'the surviving diagnostic should be the unrelated column');
    });

    it('resolves quickly and matches nothing for a pathological multi-"*" pattern', async () => {
      // Regression guard: an earlier regex-based glob compiler translated
      // every '*' into '.*', so a pattern with many interior wildcards
      // separated by short literals (e.g. repeated "a*") produced a regex
      // that catastrophically backtracks against a long non-matching input
      // and hangs the extension host. Only a single leading/trailing '*' is
      // supported; an interior '*' now compiles to an "inert" pattern that
      // structurally cannot backtrack (plain startsWith/endsWith/includes,
      // never regex) and simply never matches.
      const maliciousPattern = `*${'a*'.repeat(25)}b`;
      const issues: IDiagnosticIssue[] = [
        createMockIssue('high-null-rate', 'Column "activities.aaaa...a" has 91% NULL values', 10, {
          table: 'activities',
          column: 'a'.repeat(40),
        }),
      ];

      manager.registerProvider(createMockProvider('dq', 'dataQuality', issues));

      sinon.stub(workspace, 'getConfiguration').returns({
        get: (key: string, defaultVal?: unknown) => {
          if (key === 'columnNameExclusions') {
            return { 'high-null-rate': [maliciousPattern] };
          }
          if (key === 'categories.dataQuality') return true;
          return defaultVal;
        },
      } as any);

      (manager as any)._lastRefresh = 0;
      const start = Date.now();
      await manager.refresh();
      const elapsedMs = Date.now() - start;

      assert.ok(elapsedMs < 1000, `refresh should resolve quickly, took ${elapsedMs}ms`);

      const collection = manager.collection as unknown as MockDiagnosticCollection;
      const allDiags = [...collection.entries().values()].flat();
      assert.strictEqual(allDiags.length, 1, 'multi-"*" pattern is inert and must not suppress');
    });
  });
});
