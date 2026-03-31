/**
 * Tests for actionable warning buttons across the extension.
 *
 * Every showWarningMessage that references a destination (settings, docs,
 * output channel, etc.) must offer a button that takes the user there.
 * These tests verify the button labels appear and trigger the expected
 * VS Code commands when clicked.
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import {
  commands,
  dialogMock,
  messageMock,
  mockCommands,
  resetMocks,
} from './vscode-mock';
import { maybeNotifyServerEvent } from '../server-discovery-notify';
import { registerRefreshTreeCommand } from '../tree/tree-commands';
import {
  fakeContext,
  mockTreeProvider,
  mockDiscovery,
  mockConnectionChannel,
} from './tree-button-fixtures';
import { registerDiscoveryCommands } from '../navigation/nav-commands-discovery';

/** Flush microtasks so .then() handlers on showWarningMessage run. */
async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

// ── tree-commands.ts: cached schema → Retry button ──────────────────

describe('Warning buttons — tree refresh', () => {
  beforeEach(() => resetMocks());

  it('offers Retry button when tree has cached schema only', async () => {
    const ctx = fakeContext() as any;
    registerRefreshTreeCommand(ctx, mockTreeProvider({ connected: false, offlineSchema: true }));

    // User clicks "Retry" on the warning
    dialogMock.warningMessageResult = 'Retry';
    await commands.executeRegistered('driftViewer.refreshTree');
    // Clear before flush so the retry invocation doesn't loop infinitely
    dialogMock.warningMessageResult = undefined;
    await flush();

    assert.ok(
      messageMock.warnings.some((m) => m.includes('cached schema only')),
      'should show the cached-schema warning',
    );
    assert.ok(
      mockCommands.executed.includes('driftViewer.refreshTree'),
      'Retry button should re-execute driftViewer.refreshTree',
    );
  });

  it('offers Open Settings button when schema load fails completely', async () => {
    const ctx = fakeContext() as any;
    registerRefreshTreeCommand(ctx, mockTreeProvider({ connected: false, offlineSchema: false }));

    // User clicks "Open Settings" on the warning
    dialogMock.warningMessageResult = 'Open Settings';
    await commands.executeRegistered('driftViewer.refreshTree');
    await flush();

    assert.ok(
      messageMock.warnings.some((m) => m.includes('Could not load schema')),
      'should show the schema-load-failed warning',
    );
    assert.ok(
      mockCommands.executed.includes('workbench.action.openSettings'),
      'Open Settings button should open VS Code settings',
    );
  });

  it('does nothing extra when user dismisses cached-schema warning', async () => {
    const ctx = fakeContext() as any;
    registerRefreshTreeCommand(ctx, mockTreeProvider({ connected: false, offlineSchema: true }));

    // User dismisses without clicking a button
    dialogMock.warningMessageResult = undefined;
    await commands.executeRegistered('driftViewer.refreshTree');
    await flush();

    assert.ok(
      messageMock.warnings.some((m) => m.includes('cached schema only')),
      'warning should still appear',
    );
    // refreshTree was called once (the initial invocation), but no retry
    const refreshCalls = mockCommands.executed.filter(
      (c) => c === 'driftViewer.refreshTree',
    );
    assert.strictEqual(refreshCalls.length, 0, 'no retry command should fire on dismiss');
  });
});

// ── server-discovery-notify.ts: lost → Retry Discovery button ───────

describe('Warning buttons — server discovery notify', () => {
  beforeEach(() => resetMocks());

  it('offers Retry Discovery button when server is lost', async () => {
    dialogMock.warningMessageResult = 'Retry Discovery';
    const notified = new Map<number, number>();

    maybeNotifyServerEvent('127.0.0.1', 8642, 'lost', notified, 0);
    await flush();

    assert.ok(
      messageMock.warnings.some((m) => m.includes('no longer responding')),
      'should show the lost-server warning',
    );
    assert.ok(
      mockCommands.executed.includes('driftViewer.retryDiscovery'),
      'Retry Discovery button should trigger retryDiscovery command',
    );
  });

  it('does not retry when user dismisses lost-server warning', async () => {
    dialogMock.warningMessageResult = undefined;
    const notified = new Map<number, number>();

    maybeNotifyServerEvent('127.0.0.1', 8642, 'lost', notified, 0);
    await flush();

    assert.ok(
      messageMock.warnings.some((m) => m.includes('no longer responding')),
    );
    assert.ok(
      !mockCommands.executed.includes('driftViewer.retryDiscovery'),
      'should not retry on dismiss',
    );
  });
});

// ── nav-commands-discovery.ts: discovery disabled → Open Settings ────

describe('Warning buttons — pause discovery when disabled', () => {
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    resetMocks();
    fetchStub = sinon.stub(globalThis, 'fetch');
    fetchStub.rejects(new Error('offline'));
  });

  afterEach(() => {
    fetchStub.restore();
  });

  it('offers Open Settings when discovery is disabled in config', async () => {
    const ctx = fakeContext() as any;
    const discovery = mockDiscovery();
    const channel = mockConnectionChannel();

    // Override getConfiguration to return discovery.enabled = false
    const vscode = require('./vscode-mock');
    const origGetConfig = vscode.workspace.getConfiguration;
    vscode.workspace.getConfiguration = (_section?: string) => ({
      get: <T>(key: string, defaultValue?: T): T | undefined => {
        if (key === 'discovery.enabled') return false as any;
        return defaultValue;
      },
    });

    try {
      registerDiscoveryCommands(
        ctx, 8642, { selectServer: sinon.stub() } as any,
        discovery, channel, () => { /* no-op log */ },
      );

      dialogMock.warningMessageResult = 'Open Settings';
      await commands.executeRegistered('driftViewer.pauseDiscovery');
      await flush();

      assert.ok(
        messageMock.warnings.some((m) => m.includes('disabled in settings')),
        'should show the discovery-disabled warning',
      );
      assert.ok(
        mockCommands.executed.includes('workbench.action.openSettings'),
        'Open Settings button should open VS Code settings',
      );
    } finally {
      vscode.workspace.getConfiguration = origGetConfig;
    }
  });
});
