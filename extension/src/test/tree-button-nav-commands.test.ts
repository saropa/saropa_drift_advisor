/**
 * Integration tests: every nav-command button produces visible output.
 *
 * These tests register the real command handlers via registerNavCommands(),
 * invoke them with commands.executeRegistered(), and assert that at least one
 * user-visible artifact was produced (toast, output channel line, or webview
 * panel). No command is allowed to execute silently.
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import { commands, messageMock, resetMocks } from './vscode-mock';
import { registerNavCommands } from '../navigation/nav-commands-core';
import { DriftApiClient } from '../api-client';
import {
  fakeContext,
  mockDiagnosticManager,
  mockEditingBridge,
  mockFkNavigator,
  mockFilterBridge,
  mockServerManager,
  mockDiscovery,
  mockConnectionChannel,
} from './tree-button-fixtures';
import type { MockOutputChannel } from './vscode-mock-classes';

describe('Tree-button nav commands — visible output', () => {
  let fetchStub: sinon.SinonStub;
  let client: DriftApiClient;
  let serverManager: any;
  let discovery: any;
  let channel: MockOutputChannel;

  beforeEach(() => {
    resetMocks();
    messageMock.reset();
    fetchStub = sinon.stub(globalThis, 'fetch');
    // Default: all fetch calls reject (server down).
    fetchStub.rejects(new Error('connection refused'));
    client = new DriftApiClient('127.0.0.1', 8642);
    serverManager = mockServerManager();
    discovery = mockDiscovery();
    channel = mockConnectionChannel();
  });

  afterEach(() => {
    fetchStub.restore();
  });

  /**
   * Register all nav commands with defaults. Callers can override individual
   * dependencies by passing them in opts.
   */
  function registerAll(opts?: {
    refreshConnectionUi?: () => void;
  }): void {
    const ctx = fakeContext() as any;
    registerNavCommands(
      ctx,
      client,
      mockDiagnosticManager(),
      mockEditingBridge(),
      mockFkNavigator(),
      serverManager,
      discovery,
      mockFilterBridge(),
      channel as any,
      opts?.refreshConnectionUi,
    );
  }

  // ── retryDiscovery ─────────────────────────────────────────────────

  describe('driftViewer.retryDiscovery', () => {
    it('shows info toast and calls discovery.retry()', async () => {
      registerAll();
      await commands.executeRegistered('driftViewer.retryDiscovery');
      assert.ok(
        messageMock.infos.some((m) => m.includes('Retrying server discovery')),
        'should show retrying toast',
      );
      assert.strictEqual(
        discovery.retry.callCount, 1,
        'should call discovery.retry()',
      );
    });

    it('shows error toast when discovery.retry() throws', async () => {
      discovery.retry = sinon.stub().throws(new Error('scan failed'));
      registerAll();
      await commands.executeRegistered('driftViewer.retryDiscovery');
      assert.ok(
        messageMock.errors.some((m) => m.includes('Retry discovery failed')),
        'should show error toast',
      );
    });
  });

  // ── diagnoseConnection ─────────────────────────────────────────────

  describe('driftViewer.diagnoseConnection', () => {
    it('writes diagnostic lines to output channel and shows toast', async () => {
      registerAll();
      await commands.executeRegistered('driftViewer.diagnoseConnection');
      // Output channel should have diagnostic header
      assert.ok(
        channel.lines.some((l) => l.includes('Diagnose Connection')),
        'should write header to output channel',
      );
      // Toast shown
      assert.ok(
        messageMock.infos.some((m) => m.includes('Connection diagnosis written')),
        'should show completion toast',
      );
    });

    it('includes health failure in output when API rejects', async () => {
      registerAll();
      await commands.executeRegistered('driftViewer.diagnoseConnection');
      // health() rejects because fetchStub rejects
      assert.ok(
        channel.lines.some((l) => l.includes('health() FAILED')),
        'should log health failure to channel',
      );
    });
  });

  // ── showConnectionLog ──────────────────────────────────────────────

  describe('driftViewer.showConnectionLog', () => {
    it('shows info toast about the Output channel', async () => {
      registerAll();
      await commands.executeRegistered('driftViewer.showConnectionLog');
      assert.ok(
        messageMock.infos.some((m) => m.includes('Opened Output')),
        'should show info toast',
      );
    });
  });

  // ── selectServer ───────────────────────────────────────────────────

  describe('driftViewer.selectServer', () => {
    it('calls serverManager.selectServer()', async () => {
      registerAll();
      await commands.executeRegistered('driftViewer.selectServer');
      assert.strictEqual(serverManager.selectServer.callCount, 1);
    });

    it('shows connected toast when active server is set', async () => {
      serverManager = mockServerManager({
        activeServer: { host: '127.0.0.1', port: 8642 },
      });
      registerAll();
      await commands.executeRegistered('driftViewer.selectServer');
      assert.ok(
        messageMock.infos.some((m) => m.includes('Connected to Drift server')),
        'should show connected toast',
      );
    });

    it('shows error toast when selectServer throws', async () => {
      serverManager.selectServer = sinon.stub().rejects(
        new Error('pick cancelled'),
      );
      registerAll();
      await commands.executeRegistered('driftViewer.selectServer');
      assert.ok(
        messageMock.errors.some((m) => m.includes('Select Server failed')),
        'should show error toast',
      );
    });
  });

  // ── forwardPortAndroid ─────────────────────────────────────────────

  describe('driftViewer.forwardPortAndroid', () => {
    it('shows initial info toast (adb error path in test env)', async () => {
      registerAll();
      await commands.executeRegistered('driftViewer.forwardPortAndroid');
      // Should show initial "Forwarding port" toast
      assert.ok(
        messageMock.infos.some((m) => m.includes('Forwarding port')),
        'should show forwarding info toast',
      );
      // adb is not on PATH in CI — error path fires, producing an error toast
      // or a success toast if somehow adb exists. Either way: visible output.
      const hasOutput =
        messageMock.infos.length > 0
        || messageMock.errors.length > 0
        || messageMock.warnings.length > 0;
      assert.ok(hasOutput, 'command must produce at least one toast');
    });
  });

  // ── openInBrowser ──────────────────────────────────────────────────

  describe('driftViewer.openInBrowser', () => {
    it('shows info toast when in VM Service mode with no active server', async () => {
      // Override client to look like VM Service mode
      Object.defineProperty(client, 'usingVmService', { get: () => true });
      registerAll();
      await commands.executeRegistered('driftViewer.openInBrowser');
      assert.ok(
        messageMock.infos.some((m) =>
          m.includes('Open in browser is only available'),
        ),
        'should show VM-mode info toast',
      );
    });

    it('opens external URL without errors when not in VM Service mode', async () => {
      registerAll();
      await commands.executeRegistered('driftViewer.openInBrowser');
      // env.openExternal resolves to true in the mock — no errors expected
      assert.strictEqual(messageMock.errors.length, 0, 'no error toasts');
      assert.strictEqual(messageMock.warnings.length, 0, 'no warning toasts');
    });
  });

  // ── refreshConnectionUi ────────────────────────────────────────────

  describe('driftViewer.refreshConnectionUi', () => {
    it('calls refreshConnectionUi callback and shows toast', async () => {
      const refreshSpy = sinon.spy();
      registerAll({ refreshConnectionUi: refreshSpy });
      await commands.executeRegistered('driftViewer.refreshConnectionUi');
      assert.ok(
        messageMock.infos.some((m) =>
          m.includes('Sidebar connection state refreshed'),
        ),
        'should show refreshed toast',
      );
      assert.strictEqual(refreshSpy.callCount, 1, 'callback should be called');
    });

    it('shows toast even when no callback is provided', async () => {
      registerAll();
      await commands.executeRegistered('driftViewer.refreshConnectionUi');
      assert.ok(
        messageMock.infos.some((m) =>
          m.includes('Sidebar connection state refreshed'),
        ),
        'should show refreshed toast without callback',
      );
    });

    it('shows error toast when callback throws', async () => {
      registerAll({
        refreshConnectionUi: () => { throw new Error('UI broken'); },
      });
      await commands.executeRegistered('driftViewer.refreshConnectionUi');
      assert.ok(
        messageMock.errors.some((m) =>
          m.includes('Refresh connection UI failed'),
        ),
        'should show error toast',
      );
    });
  });

  // ── openConnectionHelp ─────────────────────────────────────────────

  describe('driftViewer.openConnectionHelp', () => {
    it('shows info toast about opening help', async () => {
      registerAll();
      await commands.executeRegistered('driftViewer.openConnectionHelp');
      assert.ok(
        messageMock.infos.some((m) => m.includes('Opening connection help')),
        'should show opening-help toast',
      );
    });
  });
});
