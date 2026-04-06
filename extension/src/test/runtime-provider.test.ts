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
});
