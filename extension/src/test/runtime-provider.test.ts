import * as assert from 'assert';
import * as sinon from 'sinon';
import {
  Diagnostic,
  DiagnosticSeverity,
  Range,
} from './vscode-mock-classes';
import { resetMocks, Uri, workspace } from './vscode-mock';
import { RuntimeProvider } from '../diagnostics/providers/runtime-provider';
import type { IDiagnosticContext } from '../diagnostics/diagnostic-types';

describe('RuntimeProvider', () => {
  let provider: RuntimeProvider;
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    fetchStub = sinon.stub(global, 'fetch');
    fetchStub.resolves(new Response(JSON.stringify({ generation: 1 }), { status: 200 }));

    // Mock workspace folders
    (workspace as any).workspaceFolders = [
      { uri: Uri.parse('file:///workspace'), name: 'workspace', index: 0 },
    ];

    provider = new RuntimeProvider();
    resetMocks();
  });

  afterEach(() => {
    provider.dispose();
    sinon.restore();
  });

  describe('event recording', () => {
    it('should record breakpoint hits', () => {
      provider.recordBreakpointHit('users', 'Row count exceeded 100');

      assert.strictEqual(provider.events.length, 1);
      assert.strictEqual(provider.events[0].type, 'breakpoint-hit');
      assert.strictEqual(provider.events[0].table, 'users');
    });

    it('should record row insertions', () => {
      provider.recordRowsInserted('orders', 5);

      assert.strictEqual(provider.events.length, 1);
      assert.strictEqual(provider.events[0].type, 'row-inserted');
      assert.strictEqual(provider.events[0].count, 5);
    });

    it('should record row deletions', () => {
      provider.recordRowsDeleted('logs', 10);

      assert.strictEqual(provider.events.length, 1);
      assert.strictEqual(provider.events[0].type, 'row-deleted');
      assert.strictEqual(provider.events[0].count, 10);
    });

    it('should record connection errors', () => {
      provider.recordConnectionError('Connection refused');

      assert.strictEqual(provider.events.length, 1);
      assert.strictEqual(provider.events[0].type, 'connection-error');
    });

    it('should clear all events', () => {
      provider.recordBreakpointHit('users', 'Test');
      provider.recordRowsInserted('orders', 1);
      provider.clearEvents();

      assert.strictEqual(provider.events.length, 0);
    });
  });

  describe('collectDiagnostics', () => {
    it('should convert breakpoint hits to diagnostics', async () => {
      provider.recordBreakpointHit('users', 'Row count exceeded 100');

      const ctx = createContext();
      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'data-breakpoint-hit');
      assert.ok(issue, 'Should report data-breakpoint-hit');
      assert.ok(issue.message.includes('Row count exceeded'));
      assert.strictEqual(issue.severity, DiagnosticSeverity.Warning);
    });

    it('should convert row insertions to diagnostics', async () => {
      provider.recordRowsInserted('orders', 5);

      const ctx = createContext();
      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'row-inserted-alert');
      assert.ok(issue, 'Should report row-inserted-alert');
      assert.ok(issue.message.includes('5 row(s) inserted'));
      assert.strictEqual(issue.severity, DiagnosticSeverity.Information);
    });

    it('should convert row deletions to diagnostics', async () => {
      provider.recordRowsDeleted('logs', 10);

      const ctx = createContext();
      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'row-deleted-alert');
      assert.ok(issue, 'Should report row-deleted-alert');
      assert.ok(issue.message.includes('10 row(s) deleted'));
    });

    it('should report connection error when API fails', async () => {
      const ctx = createContext({
        generation: () => Promise.reject(new Error('ECONNREFUSED')),
      });
      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'connection-error');
      assert.ok(issue, 'Should report connection-error');
      assert.strictEqual(issue.severity, DiagnosticSeverity.Error);
    });

    it('should not duplicate connection errors within 30 seconds', async () => {
      provider.recordConnectionError('Connection refused');
      const ctx = createContext({
        generation: () => Promise.reject(new Error('ECONNREFUSED')),
      });
      const issues = await provider.collectDiagnostics(ctx);

      const connectionErrors = issues.filter((i) => i.code === 'connection-error');
      assert.strictEqual(connectionErrors.length, 1, 'Should not duplicate');
    });
  });

  describe('provideCodeActions', () => {
    it('should provide add breakpoint action for breakpoint hits', () => {
      const diag = new Diagnostic(
        new Range(0, 0, 0, 0),
        '[drift_advisor] Data breakpoint fired',
        DiagnosticSeverity.Warning,
      );
      diag.code = 'data-breakpoint-hit';

      const actions = provider.provideCodeActions(diag as any, {} as any);

      const addAction = actions.find((a) => a.title.includes('Add'));
      assert.ok(addAction, 'Should have add breakpoint action');
      assert.strictEqual(addAction.command?.command, 'driftViewer.addDataBreakpoint');
    });

    it('should provide view table action for row alerts', () => {
      const diag = new Diagnostic(
        new Range(0, 0, 0, 0),
        '[drift_advisor] 5 row(s) inserted',
        DiagnosticSeverity.Information,
      );
      diag.code = 'row-inserted-alert';
      (diag as any).data = { table: 'orders', count: 5 };

      const actions = provider.provideCodeActions(diag as any, {} as any);

      const viewAction = actions.find((a) => a.title.includes('View'));
      assert.ok(viewAction, 'Should have view table action');
      assert.ok(viewAction.isPreferred, 'View should be preferred');
      assert.strictEqual(viewAction.command?.command, 'driftViewer.viewTableInPanel');
    });

    it('should provide clear alerts action for row alerts', () => {
      const diag = new Diagnostic(
        new Range(0, 0, 0, 0),
        '[drift_advisor] 5 row(s) inserted',
        DiagnosticSeverity.Information,
      );
      diag.code = 'row-inserted-alert';
      (diag as any).data = { table: 'orders', count: 5 };

      const actions = provider.provideCodeActions(diag as any, {} as any);

      const clearAction = actions.find((a) => a.title.includes('Clear'));
      assert.ok(clearAction, 'Should have clear alerts action');
    });

    it('should provide refresh and settings actions for connection errors', () => {
      const diag = new Diagnostic(
        new Range(0, 0, 0, 0),
        '[drift_advisor] Failed to connect',
        DiagnosticSeverity.Error,
      );
      diag.code = 'connection-error';

      const actions = provider.provideCodeActions(diag as any, {} as any);

      const refreshAction = actions.find((a) => a.title.includes('Refresh'));
      assert.ok(refreshAction, 'Should have refresh action');
      assert.ok(refreshAction.isPreferred, 'Refresh should be preferred');
      assert.strictEqual(refreshAction.command?.command, 'driftViewer.refreshTree');

      const settingsAction = actions.find((a) => a.title.includes('Settings'));
      assert.ok(settingsAction, 'Should have settings action');
      assert.strictEqual(settingsAction.command?.command, 'workbench.action.openSettings');
    });

    it('should always provide disable rule action', () => {
      const diag = new Diagnostic(
        new Range(0, 0, 0, 0),
        '[drift_advisor] Test alert',
        DiagnosticSeverity.Information,
      );
      diag.code = 'row-inserted-alert';

      const actions = provider.provideCodeActions(diag as any, {} as any);

      const disableAction = actions.find((a) => a.title.includes('Disable'));
      assert.ok(disableAction, 'Should have disable action');
    });
  });
});

function createContext(clientOverrides?: Partial<{
  generation: () => Promise<number>;
}>): IDiagnosticContext {
  const client = {
    generation: clientOverrides?.generation ?? (() => Promise.resolve(1)),
    schemaMetadata: () => Promise.resolve([]),
  } as any;

  return {
    client,
    schemaIntel: {} as any,
    queryIntel: {} as any,
    dartFiles: [],
    config: {
      enabled: true,
      refreshOnSave: true,
      refreshIntervalMs: 30000,
      categories: {
        schema: true,
        performance: true,
        dataQuality: true,
        bestPractices: true,
        naming: true,
        runtime: true,
      },
      severityOverrides: {},
      disabledRules: new Set(),
    },
  };
}
