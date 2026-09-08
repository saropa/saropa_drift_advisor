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
import { DIAGNOSTIC_PREFIX } from '../diagnostics/diagnostic-defaults';
import {
  type IDiagnosticIssue,
} from '../diagnostics/diagnostic-issue-types';
import { type IDiagnosticProvider } from '../diagnostics/diagnostic-context-types';
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

  describe('refresh', () => {
    it('should collect diagnostics from all providers', async () => {
      const issues1: IDiagnosticIssue[] = [
        createMockIssue('missing-fk-index', 'Test issue 1', 10),
      ];
      const issues2: IDiagnosticIssue[] = [
        createMockIssue('full-table-scan', 'Test issue 2', 20),
      ];

      manager.registerProvider(createMockProvider('schema', 'schema', issues1));
      manager.registerProvider(createMockProvider('perf', 'performance', issues2));

      await manager.refresh();

      const collection = manager.collection as unknown as MockDiagnosticCollection;
      const allDiags = [...collection.entries().values()].flat();

      assert.strictEqual(allDiags.length, 2);

      // getLastCollectedIssues returns the same set that was applied (for Log Capture integration)
      const lastIssues = manager.getLastCollectedIssues();
      assert.strictEqual(lastIssues.length, 2);
      assert.strictEqual(lastIssues[0].code, 'missing-fk-index');
      assert.strictEqual(lastIssues[1].code, 'full-table-scan');
    });

    it('should apply [drift_advisor] prefix to all messages', async () => {
      const issues: IDiagnosticIssue[] = [
        createMockIssue('missing-fk-index', 'FK column missing index', 10),
      ];

      manager.registerProvider(createMockProvider('schema', 'schema', issues));

      await manager.refresh();

      const collection = manager.collection as unknown as MockDiagnosticCollection;
      const allDiags = [...collection.entries().values()].flat();

      assert.strictEqual(allDiags.length, 1);
      assert.ok(allDiags[0].message.startsWith(DIAGNOSTIC_PREFIX));
    });

    it('should set correct source on diagnostics', async () => {
      const issues: IDiagnosticIssue[] = [
        createMockIssue('missing-fk-index', 'Test', 10),
      ];

      manager.registerProvider(createMockProvider('schema', 'schema', issues));

      await manager.refresh();

      const collection = manager.collection as unknown as MockDiagnosticCollection;
      const allDiags = [...collection.entries().values()].flat();

      assert.strictEqual(allDiags[0].source, 'Drift Advisor');
    });

    it('should skip disabled categories', async () => {
      const schemaIssues: IDiagnosticIssue[] = [
        createMockIssue('missing-fk-index', 'Schema issue', 10),
      ];
      const namingIssues: IDiagnosticIssue[] = [
        createMockIssue('table-name-case', 'Naming issue', 20),
      ];

      manager.registerProvider(createMockProvider('schema', 'schema', schemaIssues));
      manager.registerProvider(createMockProvider('naming', 'naming', namingIssues));

      await manager.refresh();

      const collection = manager.collection as unknown as MockDiagnosticCollection;
      const allDiags = [...collection.entries().values()].flat();

      assert.strictEqual(allDiags.length, 1);
      assert.ok(allDiags[0].message.includes('Schema issue'));
    });

    it('should clear diagnostics when disabled', async () => {
      const issues: IDiagnosticIssue[] = [
        createMockIssue('missing-fk-index', 'Test', 10),
      ];
      manager.registerProvider(createMockProvider('schema', 'schema', issues));

      await manager.refresh();

      const collection = manager.collection as unknown as MockDiagnosticCollection;
      assert.strictEqual([...collection.entries().values()].flat().length, 1);

      sinon.stub(workspace, 'getConfiguration').returns({
        get: (key: string, defaultVal?: unknown) => {
          if (key === 'enabled') return false;
          return defaultVal;
        },
      } as any);

      (manager as any)._lastRefresh = 0;
      await manager.refresh();

      assert.strictEqual([...collection.entries().values()].flat().length, 0);
    });

    it('should handle provider errors gracefully', async () => {
      const goodProvider = createMockProvider('good', 'schema', [
        createMockIssue('missing-fk-index', 'Good issue', 10),
      ]);
      const badProvider: IDiagnosticProvider = {
        id: 'bad',
        category: 'performance',
        collectDiagnostics: () => Promise.reject(new Error('Provider failed')),
        dispose: () => {},
      };

      manager.registerProvider(goodProvider);
      manager.registerProvider(badProvider);

      await manager.refresh();

      const collection = manager.collection as unknown as MockDiagnosticCollection;
      const allDiags = [...collection.entries().values()].flat();
      assert.strictEqual(allDiags.length, 1);
    });
  });
});
