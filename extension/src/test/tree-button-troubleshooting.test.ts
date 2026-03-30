/**
 * Integration tests: registerTroubleshootingCommands() always produces visible output.
 *
 * The "Troubleshooting" button opens a webview panel and writes a line to the
 * output channel. If panel creation fails, an error toast and output channel
 * line must be shown. No execution path is allowed to be silent.
 */

import * as assert from 'assert';
import {
  commands,
  messageMock,
  createdPanels,
  resetMocks,
} from './vscode-mock';
import { registerTroubleshootingCommands } from '../troubleshooting/troubleshooting-commands';
import { fakeContext, mockConnectionChannel } from './tree-button-fixtures';
import type { MockOutputChannel } from './vscode-mock-classes';

describe('Tree-button troubleshooting command — visible output', () => {
  let channel: MockOutputChannel;

  beforeEach(() => {
    resetMocks();
    messageMock.reset();
    // Dispose any leftover singleton panels from the previous test so that
    // TroubleshootingPanel._currentPanel is cleared and createOrShow() will
    // call createWebviewPanel() again.
    for (const p of [...createdPanels]) {
      p.dispose();
    }
    createdPanels.length = 0;
    channel = mockConnectionChannel();
  });

  afterEach(() => {
    // Clean up the singleton between tests
    for (const p of [...createdPanels]) {
      p.dispose();
    }
  });

  function registerAll(): void {
    const ctx = fakeContext() as any;
    registerTroubleshootingCommands(ctx, channel as any);
  }

  // ── Normal — panel opens successfully ────────────────────────────────

  it('creates webview panel and writes to output channel', async () => {
    registerAll();
    await commands.executeRegistered('driftViewer.showTroubleshooting');

    // Output channel should have the "opened panel" log line
    assert.ok(
      channel.lines.some((l) => l.includes('Troubleshooting: opened panel')),
      'should write "opened panel" to output channel',
    );

    // A webview panel should have been created
    assert.strictEqual(
      createdPanels.length, 1,
      'should create exactly one webview panel',
    );
  });

  // ── Error path — panel creation throws ───────────────────────────────

  it('shows error toast and logs when panel creation throws', async () => {
    // Sabotage createWebviewPanel to throw inside TroubleshootingPanel.createOrShow.
    // The command handler wraps createOrShow in try/catch, so the error should
    // produce both an error toast and an output channel line.
    //
    // We can't easily mock the static method, so instead we make the
    // workspace.getConfiguration throw which happens before createOrShow
    // constructs the panel.
    //
    // Actually the troubleshooting handler reads config THEN calls createOrShow.
    // The try/catch wraps both. Let's override the mock's workspace config to throw.
    const origGetConfig = require('./vscode-mock').workspace.getConfiguration;
    require('./vscode-mock').workspace.getConfiguration = () => {
      throw new Error('config exploded');
    };

    try {
      registerAll();
      await commands.executeRegistered('driftViewer.showTroubleshooting');

      // The "opened panel" line is written BEFORE the try block, so it should
      // still appear even when the error path fires.
      assert.ok(
        channel.lines.some((l) => l.includes('Troubleshooting: opened panel')),
        'should still write "opened panel" line before error',
      );

      // Error toast must be shown
      assert.ok(
        messageMock.errors.some((m) =>
          m.includes('Failed to open Troubleshooting panel'),
        ),
        'should show error toast when panel creation fails',
      );

      // Output channel should also log the failure
      assert.ok(
        channel.lines.some((l) => l.includes('Troubleshooting: failed')),
        'should write failure line to output channel',
      );
    } finally {
      // Restore original workspace.getConfiguration so other tests are unaffected
      require('./vscode-mock').workspace.getConfiguration = origGetConfig;
    }
  });
});
