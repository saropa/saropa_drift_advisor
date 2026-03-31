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

/** Minimal pubspec.yaml content that declares `drift` as a dependency. */
const PUBSPEC_WITH_DRIFT = `
name: my_app
dependencies:
  drift: ^2.0.0
  flutter:
    sdk: flutter
`;

/** Pubspec that does NOT list drift (only drift_dev in dev_dependencies). */
const PUBSPEC_WITHOUT_DRIFT = `
name: my_app
dependencies:
  flutter:
    sdk: flutter
dev_dependencies:
  drift_dev: ^2.0.0
`;

describe('RuntimeProvider', () => {
  let provider: RuntimeProvider;
  let fetchStub: sinon.SinonStub;
  let fsReadStub: sinon.SinonStub;

  beforeEach(() => {
    fetchStub = sinon.stub(global, 'fetch');
    fetchStub.resolves(new Response(JSON.stringify({ generation: 1 }), { status: 200 }));

    // Mock workspace folders
    (workspace as any).workspaceFolders = [
      { uri: Uri.parse('file:///workspace'), name: 'workspace', index: 0 },
    ];

    provider = new RuntimeProvider();
    resetMocks();

    // Default: workspace has drift in pubspec (tests that need no-drift override this)
    fsReadStub = sinon.stub(workspace.fs, 'readFile').resolves(
      new TextEncoder().encode(PUBSPEC_WITH_DRIFT),
    );
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

    it('should report connection warning when API fails in a Drift project', async () => {
      const ctx = createContext({
        generation: () => Promise.reject(new Error('ECONNREFUSED')),
      });
      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'connection-error');
      assert.ok(issue, 'Should report connection-error');
      assert.strictEqual(issue.severity, DiagnosticSeverity.Warning);
      assert.ok(
        issue.message.includes('DriftDebugServer.start()'),
        'Message should tell user how to start the server',
      );
    });

    it('should NOT report connection error for non-Drift workspaces', async () => {
      // Override: pubspec without drift dependency
      fsReadStub.resolves(new TextEncoder().encode(PUBSPEC_WITHOUT_DRIFT));

      const ctx = createContext({
        generation: () => Promise.reject(new Error('ECONNREFUSED')),
      });
      const issues = await provider.collectDiagnostics(ctx);

      const connectionErrors = issues.filter((i) => i.code === 'connection-error');
      assert.strictEqual(connectionErrors.length, 0, 'Should not warn for non-Drift workspace');
    });

    it('should NOT report connection error when pubspec is missing', async () => {
      // Override: simulate missing pubspec.yaml
      fsReadStub.rejects(new Error('File not found'));

      const ctx = createContext({
        generation: () => Promise.reject(new Error('ECONNREFUSED')),
      });
      const issues = await provider.collectDiagnostics(ctx);

      const connectionErrors = issues.filter((i) => i.code === 'connection-error');
      assert.strictEqual(connectionErrors.length, 0, 'Should not warn when pubspec is missing');
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

    it('should provide retry, dismiss, and settings actions for connection errors', () => {
      const diag = new Diagnostic(
        new Range(0, 0, 0, 0),
        '[drift_advisor] Drift server not reachable',
        DiagnosticSeverity.Warning,
      );
      diag.code = 'connection-error';

      const actions = provider.provideCodeActions(diag as any, {} as any);

      // Retry Connection (preferred)
      const retryAction = actions.find((a) => a.title === 'Retry Connection');
      assert.ok(retryAction, 'Should have retry action');
      assert.ok(retryAction.isPreferred, 'Retry should be preferred');
      assert.strictEqual(retryAction.command?.command, 'driftViewer.refreshTree');

      // Don't Show Connection Warnings
      const dismissAction = actions.find((a) => a.title.includes("Don't Show"));
      assert.ok(dismissAction, 'Should have dismiss action');
      assert.strictEqual(dismissAction.command?.command, 'driftViewer.disableDiagnosticRule');
      assert.deepStrictEqual(dismissAction.command?.arguments, ['connection-error']);

      // Open Connection Settings
      const settingsAction = actions.find((a) => a.title.includes('Settings'));
      assert.ok(settingsAction, 'Should have settings action');
      assert.strictEqual(settingsAction.command?.command, 'workbench.action.openSettings');
    });

    it('should NOT include generic disable-rule action for connection errors', () => {
      const diag = new Diagnostic(
        new Range(0, 0, 0, 0),
        '[drift_advisor] Drift server not reachable',
        DiagnosticSeverity.Warning,
      );
      diag.code = 'connection-error';

      const actions = provider.provideCodeActions(diag as any, {} as any);

      const genericDisable = actions.find((a) => a.title.includes('Disable "connection-error"'));
      assert.ok(!genericDisable, 'Should NOT have generic disable-rule action');
    });

    it('should always provide disable rule action for non-connection codes', () => {
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
        compliance: true,
      },
      severityOverrides: {},
      disabledRules: new Set(),
    },
  };
}
