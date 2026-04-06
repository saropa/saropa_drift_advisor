/**
 * Integration tests: registerRefreshTreeCommand() always produces visible output.
 *
 * The "Refresh" toolbar button in the Database tree must show a toast in every
 * outcome path — connected, offline/cached, or no schema at all. These tests
 * invoke the real handler through the mock command registry and assert that
 * at least one user-visible artifact (info or warning toast) is produced.
 */

import * as assert from 'assert';
import { commands, messageMock, resetMocks } from './vscode-mock';
import { registerRefreshTreeCommand } from '../tree/tree-refresh-command';
import { fakeContext, mockTreeProvider } from './tree-button-fixtures';

describe('Tree-button refresh command — visible output', () => {
  beforeEach(() => {
    resetMocks();
    messageMock.reset();
  });

  /**
   * Register only the refreshTree command with a mock tree provider.
   * The mock's `connected` and `offlineSchema` properties are set by the
   * caller to simulate the post-refresh tree state that determines which
   * toast branch fires.
   */
  function registerRefresh(opts?: {
    connected?: boolean;
    offlineSchema?: boolean;
  }): void {
    const ctx = fakeContext() as any;
    registerRefreshTreeCommand(ctx, mockTreeProvider(opts));
  }

  // ── Connected — live schema loaded ───────────────────────────────────

  it('shows info toast when server is connected and schema loaded', async () => {
    registerRefresh({ connected: true, offlineSchema: false });
    await commands.executeRegistered('driftViewer.refreshTree');
    assert.ok(
      messageMock.infos.some((m) => m.includes('Database tree refreshed')),
      'should show "Database tree refreshed" info toast',
    );
    // No warnings or errors for a clean connected refresh
    assert.strictEqual(messageMock.warnings.length, 0, 'no warning toasts');
    assert.strictEqual(messageMock.errors.length, 0, 'no error toasts');
  });

  // ── Offline — cached schema only ─────────────────────────────────────

  it('shows warning toast when tree has cached schema only', async () => {
    registerRefresh({ connected: false, offlineSchema: true });
    await commands.executeRegistered('driftViewer.refreshTree');
    assert.ok(
      messageMock.warnings.some((m) => m.includes('cached schema only')),
      'should show "cached schema only" warning toast',
    );
    // Should NOT show the connected info toast
    assert.ok(
      !messageMock.infos.some((m) => m.includes('Database tree refreshed')),
      'should not show connected info toast when offline',
    );
  });

  // ── No schema — REST API unreachable ─────────────────────────────────

  it('shows warning toast when no schema could be loaded', async () => {
    registerRefresh({ connected: false, offlineSchema: false });
    await commands.executeRegistered('driftViewer.refreshTree');
    assert.ok(
      messageMock.warnings.some((m) => m.includes('Could not load schema')),
      'should show "Could not load schema" warning toast',
    );
    // No info toasts — the command should not pretend things are fine
    assert.ok(
      !messageMock.infos.some((m) => m.includes('Database tree refreshed')),
      'should not show connected info toast when schema load failed',
    );
  });
});
