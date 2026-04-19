/**
 * Tests for RuntimeProvider — event recording and collectDiagnostics.
 *
 * Code-action tests live in `runtime-provider-actions.test.ts`.
 * Shared helpers (createContext, pubspec constants) live in
 * `runtime-provider-test-helpers.ts`.
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import {
  DiagnosticSeverity,
} from './vscode-mock-classes';
import { resetMocks, Uri, workspace } from './vscode-mock';
import { RuntimeProvider } from '../diagnostics/providers/runtime-provider';
import {
  createContext,
  PUBSPEC_WITH_DRIFT,
  PUBSPEC_WITHOUT_DRIFT,
} from './runtime-provider-test-helpers';

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

  // ─────────────────────────────────────────────────────────
  // Event recording
  // ─────────────────────────────────────────────────────────

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

    it('should clear all events', () => {
      provider.recordBreakpointHit('users', 'Test');
      provider.recordRowsInserted('orders', 1);
      provider.clearEvents();

      assert.strictEqual(provider.events.length, 0);
    });
  });

  // ─────────────────────────────────────────────────────────
  // collectDiagnostics
  // ─────────────────────────────────────────────────────────

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

    it('should skip non-Drift folders and target the first Drift folder in multi-root workspace', async () => {
      // Simulate multi-root workspace: first folder is non-Drift, second is Drift
      const nonDriftUri = Uri.parse('file:///projects/contacts');
      const driftUri = Uri.parse('file:///projects/my-drift-app');
      (workspace as any).workspaceFolders = [
        { uri: nonDriftUri, name: 'contacts', index: 0 },
        { uri: driftUri, name: 'my-drift-app', index: 1 },
      ];

      // Fresh provider so _workspaceUri is not yet cached
      provider.dispose();
      provider = new RuntimeProvider();

      // Return non-Drift pubspec for contacts, Drift pubspec for my-drift-app
      fsReadStub.restore();
      fsReadStub = sinon.stub(workspace.fs, 'readFile').callsFake(async (uri: any) => {
        const path = uri.toString();
        if (path.includes('my-drift-app')) {
          return new TextEncoder().encode(PUBSPEC_WITH_DRIFT);
        }
        return new TextEncoder().encode(PUBSPEC_WITHOUT_DRIFT);
      });

      // Record an event so there's something to emit, then verify the
      // Drift workspace folder was selected (not the first/non-Drift one)
      provider.recordBreakpointHit('users', 'Row count exceeded');

      const ctx = createContext();
      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'data-breakpoint-hit');
      assert.ok(issue, 'Should report data-breakpoint-hit');
      assert.strictEqual(
        issue.fileUri.toString(),
        driftUri.toString(),
        'Diagnostic should target the Drift project folder, not contacts',
      );
    });

    it('should return no diagnostics when no workspace folder is a Drift project', async () => {
      // Simulate multi-root workspace with zero Drift projects
      (workspace as any).workspaceFolders = [
        { uri: Uri.parse('file:///projects/contacts'), name: 'contacts', index: 0 },
        { uri: Uri.parse('file:///projects/web-app'), name: 'web-app', index: 1 },
      ];

      // Fresh provider
      provider.dispose();
      provider = new RuntimeProvider();

      // All folders return non-Drift pubspecs
      fsReadStub.restore();
      fsReadStub = sinon.stub(workspace.fs, 'readFile').resolves(
        new TextEncoder().encode(PUBSPEC_WITHOUT_DRIFT),
      );

      // Record an event to verify it's NOT emitted without a workspace URI
      provider.recordBreakpointHit('users', 'Should be suppressed');

      const ctx = createContext();
      const issues = await provider.collectDiagnostics(ctx);

      assert.strictEqual(issues.length, 0, 'Should emit no diagnostics when no Drift folder exists');
    });
  });
});
