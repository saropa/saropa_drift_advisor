/**
 * Unit tests for SchemaSearchViewProvider ready-handshake, connection state
 * delivery, diagnostic output, and visibility-change re-post behaviour.
 *
 * These tests verify that the webview script must send a 'ready' message
 * before the extension host delivers connection state, preventing the
 * silent message-drop race condition that caused the Schema Search panel
 * to be stuck on its loading indicator.
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import { resetMocks } from './vscode-mock';
import { EventEmitter } from './vscode-mock-classes';
import { MockWebview } from './vscode-mock-types';
import { DriftApiClient } from '../api-client';
import { SchemaSearchViewProvider } from '../schema-search/schema-search-view';
import type { DriftConnectionPresentation } from '../connection-ui-state';

/**
 * Minimal mock for vscode.WebviewView — satisfies the interface that
 * resolveWebviewView expects (webview, visible, onDidChangeVisibility,
 * onDidDispose). Visibility is controllable for testing re-post behaviour.
 */
class MockWebviewView {
  webview = new MockWebview();
  visible = true;

  private _onDidChangeVisibility = new EventEmitter();
  onDidChangeVisibility = this._onDidChangeVisibility.event;

  private _onDidDispose = new EventEmitter();
  onDidDispose = this._onDidDispose.event;

  /** Simulate the user hiding and re-showing the panel. */
  simulateShow(): void {
    this.visible = true;
    this._onDidChangeVisibility.fire();
  }

  simulateHide(): void {
    this.visible = false;
    this._onDidChangeVisibility.fire();
  }
}

/** Stub revealTable callback that records calls. */
function stubReveal(): { fn: (name: string) => Promise<void>; calls: string[] } {
  const calls: string[] = [];
  return { fn: async (name) => { calls.push(name); }, calls };
}

/** Build a connected presentation for testing. */
function connectedPresentation(): DriftConnectionPresentation {
  return {
    connected: true,
    schemaOperationsEnabled: true,
    persistedSchemaAvailable: false,
    label: 'Connected via HTTP 127.0.0.1:8642',
    hint: 'HTTP discovery on port 8642',
    viaHttp: true,
    viaVm: false,
  };
}

/** Build a disconnected presentation for testing. */
function disconnectedPresentation(): DriftConnectionPresentation {
  return {
    connected: false,
    schemaOperationsEnabled: false,
    persistedSchemaAvailable: false,
    label: 'Not connected',
    hint: 'Waiting for server…',
    viaHttp: false,
    viaVm: false,
  };
}

/** No-op cancellation token satisfying the vscode API shape. */
const cancelToken = {
  isCancellationRequested: false,
  onCancellationRequested: () => ({ dispose: () => { /* no-op */ } }),
};

describe('SchemaSearchViewProvider', () => {
  let sandbox: sinon.SinonSandbox;
  let client: DriftApiClient;
  let provider: SchemaSearchViewProvider;
  let view: MockWebviewView;

  beforeEach(() => {
    resetMocks();
    sandbox = sinon.createSandbox();
    client = new DriftApiClient('127.0.0.1', 8642);
    // Stub fetch to prevent real HTTP calls during provider construction.
    sandbox.stub(globalThis, 'fetch').resolves(
      new Response(JSON.stringify({ tables: [] }), { status: 200 }),
    );
    provider = new SchemaSearchViewProvider(client, stubReveal().fn);
    view = new MockWebviewView();
  });

  afterEach(() => {
    sandbox.restore();
  });

  // ─── Ready handshake ─────────────────────────────────────────────

  describe('ready handshake', () => {
    it('does not post connectionState before webview sends ready', () => {
      // Set a connected presentation before resolving the view.
      provider.setConnectionPresentation(connectedPresentation());

      // Resolve the webview — this should NOT post connectionState yet because
      // the webview script hasn't run addEventListener('message', ...).
      provider.resolveWebviewView(view as any, {} as any, cancelToken as any);

      // The webview HTML should be set, but no connectionState message posted.
      const stateMessages = view.webview.postedMessages.filter(
        (m: any) => m.command === 'connectionState',
      );
      assert.strictEqual(
        stateMessages.length,
        0,
        'connectionState must not be posted before ready handshake',
      );
    });

    it('delivers connectionState after webview sends ready', () => {
      provider.setConnectionPresentation(connectedPresentation());
      provider.resolveWebviewView(view as any, {} as any, cancelToken as any);

      // Simulate the webview script sending { command: 'ready' }.
      view.webview.simulateMessage({ command: 'ready' });

      const stateMessages = view.webview.postedMessages.filter(
        (m: any) => m.command === 'connectionState',
      );
      assert.strictEqual(stateMessages.length, 1, 'connectionState delivered on ready');
      assert.strictEqual((stateMessages[0] as any).connected, true);
      assert.strictEqual((stateMessages[0] as any).schemaOperationsEnabled, true);
      assert.strictEqual((stateMessages[0] as any).persistedSchemaAvailable, false);
      assert.strictEqual((stateMessages[0] as any).label, 'Connected via HTTP 127.0.0.1:8642');
    });

    it('delivers connectionState set after ready', () => {
      provider.resolveWebviewView(view as any, {} as any, cancelToken as any);
      view.webview.simulateMessage({ command: 'ready' });

      // Clear any messages from the ready handshake.
      view.webview.postedMessages.length = 0;

      // Now set connection presentation — should post immediately.
      provider.setConnectionPresentation(connectedPresentation());

      const stateMessages = view.webview.postedMessages.filter(
        (m: any) => m.command === 'connectionState',
      );
      assert.strictEqual(stateMessages.length, 1, 'connectionState delivered after ready');
      assert.strictEqual((stateMessages[0] as any).connected, true);
    });

    it('resets ready flag when webview is re-resolved (panel hidden and re-shown)', () => {
      // First resolve + ready.
      provider.resolveWebviewView(view as any, {} as any, cancelToken as any);
      view.webview.simulateMessage({ command: 'ready' });
      view.webview.postedMessages.length = 0;

      // Simulate VS Code destroying and re-creating the webview (new view instance).
      const view2 = new MockWebviewView();
      provider.resolveWebviewView(view2 as any, {} as any, cancelToken as any);

      // setConnectionPresentation should NOT post to view2 yet — ready not received.
      provider.setConnectionPresentation(connectedPresentation());
      const stateMessages = view2.webview.postedMessages.filter(
        (m: any) => m.command === 'connectionState',
      );
      assert.strictEqual(
        stateMessages.length,
        0,
        'connectionState must not be posted on re-resolved view before ready',
      );

      // Now view2 sends ready — connectionState should be delivered.
      view2.webview.simulateMessage({ command: 'ready' });
      const afterReady = view2.webview.postedMessages.filter(
        (m: any) => m.command === 'connectionState',
      );
      assert.strictEqual(afterReady.length, 1, 'connectionState delivered on re-resolved ready');
    });
  });

  // ─── Visibility change ───────────────────────────────────────────

  describe('visibility change', () => {
    it('re-posts connectionState when panel becomes visible after ready', () => {
      provider.setConnectionPresentation(connectedPresentation());
      provider.resolveWebviewView(view as any, {} as any, cancelToken as any);
      view.webview.simulateMessage({ command: 'ready' });
      view.webview.postedMessages.length = 0;

      // Simulate hiding then re-showing the panel.
      view.simulateHide();
      view.simulateShow();

      const stateMessages = view.webview.postedMessages.filter(
        (m: any) => m.command === 'connectionState',
      );
      assert.strictEqual(stateMessages.length, 1, 'connectionState re-posted on visibility');
      assert.strictEqual((stateMessages[0] as any).connected, true);
    });

    it('does not post connectionState on visibility change before ready', () => {
      provider.setConnectionPresentation(connectedPresentation());
      provider.resolveWebviewView(view as any, {} as any, cancelToken as any);
      // Do NOT send 'ready'.

      view.simulateHide();
      view.simulateShow();

      const stateMessages = view.webview.postedMessages.filter(
        (m: any) => m.command === 'connectionState',
      );
      assert.strictEqual(
        stateMessages.length,
        0,
        'visibility change must not bypass the ready guard',
      );
    });
  });

  // ─── getDiagnosticState ──────────────────────────────────────────

  describe('getDiagnosticState', () => {
    it('reports viewResolved=false before resolveWebviewView', () => {
      const state = provider.getDiagnosticState();
      assert.strictEqual(state.viewResolved, false);
      assert.strictEqual(state.webviewReady, false);
      assert.strictEqual(state.presentationConnected, false);
      assert.strictEqual(state.presentationLabel, 'Not connected');
    });

    it('reports viewResolved=true, webviewReady=false after resolve but before ready', () => {
      provider.resolveWebviewView(view as any, {} as any, cancelToken as any);
      const state = provider.getDiagnosticState();
      assert.strictEqual(state.viewResolved, true);
      assert.strictEqual(state.webviewReady, false);
    });

    it('reports webviewReady=true after ready handshake', () => {
      provider.resolveWebviewView(view as any, {} as any, cancelToken as any);
      view.webview.simulateMessage({ command: 'ready' });
      const state = provider.getDiagnosticState();
      assert.strictEqual(state.viewResolved, true);
      assert.strictEqual(state.webviewReady, true);
    });

    it('reports presentationConnected=true after setConnectionPresentation(connected)', () => {
      provider.setConnectionPresentation(connectedPresentation());
      const state = provider.getDiagnosticState();
      assert.strictEqual(state.presentationConnected, true);
      assert.ok(state.presentationLabel.includes('HTTP'));
    });
  });

  // ─── setConnectionLog ────────────────────────────────────────────

  describe('setConnectionLog', () => {
    it('injects a connection log that receives ready-handshake entry', () => {
      const lines: string[] = [];
      provider.setConnectionLog({ appendLine: (l) => lines.push(l) });

      provider.resolveWebviewView(view as any, {} as any, cancelToken as any);
      view.webview.simulateMessage({ command: 'ready' });

      // The provider should log the ready handshake through the injected log.
      const readyLines = lines.filter((l) => l.includes('ready'));
      assert.ok(readyLines.length > 0, 'ready handshake should be logged');
    });

    it('allows replacing the connection log', () => {
      const firstLines: string[] = [];
      const secondLines: string[] = [];
      provider.setConnectionLog({ appendLine: (l) => firstLines.push(l) });
      provider.setConnectionLog({ appendLine: (l) => secondLines.push(l) });

      provider.resolveWebviewView(view as any, {} as any, cancelToken as any);
      view.webview.simulateMessage({ command: 'ready' });

      assert.strictEqual(firstLines.length, 0, 'first log should not receive entries after replacement');
      assert.ok(secondLines.length > 0, 'second log should receive entries');
    });
  });

});
