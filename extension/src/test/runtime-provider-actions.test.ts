/**
 * Tests for RuntimeProvider.provideCodeActions.
 *
 * Event-recording and collectDiagnostics tests live in
 * `runtime-provider.test.ts`.  Shared helpers (createContext, pubspec
 * constants) live in `runtime-provider-test-helpers.ts`.
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import {
  Diagnostic,
  DiagnosticSeverity,
  Range,
} from './vscode-mock-classes';
import { resetMocks, Uri, workspace } from './vscode-mock';
import { RuntimeProvider } from '../diagnostics/providers/runtime-provider';
import { PUBSPEC_WITH_DRIFT } from './runtime-provider-test-helpers';

describe('RuntimeProvider', () => {
  let provider: RuntimeProvider;
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    fetchStub = sinon.stub(global, 'fetch');
    fetchStub.resolves(new Response(JSON.stringify({ generation: 1 }), { status: 200 }));

    // Mock workspace folders so the provider initialises correctly
    (workspace as any).workspaceFolders = [
      { uri: Uri.parse('file:///workspace'), name: 'workspace', index: 0 },
    ];

    provider = new RuntimeProvider();
    resetMocks();

    // Default: workspace has drift in pubspec
    sinon.stub(workspace.fs, 'readFile').resolves(
      new TextEncoder().encode(PUBSPEC_WITH_DRIFT),
    );
  });

  afterEach(() => {
    provider.dispose();
    sinon.restore();
  });

  // ─────────────────────────────────────────────────────────
  // provideCodeActions
  // ─────────────────────────────────────────────────────────

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
