import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from './vscode-mock';
import {
  CodeAction,
  CodeActionKind,
  Diagnostic,
  DiagnosticSeverity,
  MockDiagnosticCollection,
  Range,
  Uri,
} from './vscode-mock-classes';
import { resetMocks } from './vscode-mock';
import { DriftApiClient } from '../api-client';
import { SchemaIntelligence } from '../engines/schema-intelligence';
import { QueryIntelligence } from '../engines/query-intelligence';
import {
  DiagnosticManager,
} from '../diagnostics/diagnostic-manager';
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

  describe('provider registration', () => {
    it('should register a provider', () => {
      const provider = createMockProvider('test', 'schema', []);
      const disposable = manager.registerProvider(provider);

      assert.strictEqual(manager.providerCount, 1);
      assert.strictEqual(manager.getProvider('test'), provider);

      disposable.dispose();
      assert.strictEqual(manager.providerCount, 0);
    });

    it('should throw when registering duplicate provider id', () => {
      const provider1 = createMockProvider('test', 'schema', []);
      const provider2 = createMockProvider('test', 'schema', []);

      manager.registerProvider(provider1);

      assert.throws(
        () => manager.registerProvider(provider2),
        /already registered/,
      );
    });

    it('should dispose provider when unregistered', () => {
      const provider = createMockProvider('test', 'schema', []);
      const disposeSpy = sinon.spy(provider, 'dispose');

      const disposable = manager.registerProvider(provider);
      disposable.dispose();

      assert.ok(disposeSpy.calledOnce);
    });
  });

  describe('clear', () => {
    it('should clear all diagnostics', async () => {
      const issues: IDiagnosticIssue[] = [
        createMockIssue('missing-fk-index', 'Test', 10),
      ];
      manager.registerProvider(createMockProvider('schema', 'schema', issues));

      await manager.refresh();

      const collection = manager.collection as unknown as MockDiagnosticCollection;
      assert.strictEqual([...collection.entries().values()].flat().length, 1);

      manager.clear();

      assert.strictEqual([...collection.entries().values()].flat().length, 0);
    });
  });

  describe('code actions', () => {
    it('should delegate code actions to provider', async () => {
      const codeAction = new CodeAction('Fix it', CodeActionKind.QuickFix);

      const provider: IDiagnosticProvider = {
        id: 'schema',
        category: 'schema',
        collectDiagnostics: () => Promise.resolve([]),
        provideCodeActions: () => [codeAction] as any,
        dispose: () => {},
      };

      manager.registerProvider(provider);

      const diag = new Diagnostic(
        new Range(0, 0, 0, 10),
        'Test',
        DiagnosticSeverity.Warning,
      );
      diag.code = 'missing-fk-index';

      const doc = { uri: Uri.parse('file:///lib/x.dart') };
      const actions = manager.provideCodeActions(diag as any, doc as any);

      // Provider action plus the two always-on inline-ignore quick fixes
      // (column + file) the manager appends to every advisor diagnostic.
      assert.ok(actions.some((a) => a.title === 'Fix it'));
      assert.ok(actions.some((a) => a.title.includes('for this column')));
      assert.ok(actions.some((a) => a.title.includes('in this file')));
    });

    it('should return empty array for unknown diagnostic code', () => {
      const diag = new Diagnostic(
        new Range(0, 0, 0, 10),
        'Test',
        DiagnosticSeverity.Warning,
      );
      diag.code = 'unknown-code';

      const actions = manager.provideCodeActions(diag as any, {} as any);

      assert.strictEqual(actions.length, 0);
    });
  });

  describe('dispose', () => {
    it('should dispose all providers', () => {
      const provider1 = createMockProvider('p1', 'schema', []);
      const provider2 = createMockProvider('p2', 'performance', []);
      const spy1 = sinon.spy(provider1, 'dispose');
      const spy2 = sinon.spy(provider2, 'dispose');

      manager.registerProvider(provider1);
      manager.registerProvider(provider2);

      manager.dispose();

      assert.ok(spy1.calledOnce);
      assert.ok(spy2.calledOnce);
    });
  });
});
