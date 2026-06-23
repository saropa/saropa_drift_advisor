/**
 * Unit tests for the Troubleshooting panel's live diagnostics: state
 * normalization, debug-session capture, and the status-header derivation that
 * splits a non-working state into the two real causes (no debugger vs. debugger
 * but no server).
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  deriveStatus,
  gatherConnectionDiagnostics,
  type ConnectionDiagnostics,
} from '../troubleshooting/connection-diagnostics';
import { resetMocks } from './vscode-mock';

const vscodeMock = vscode as any;

/** Builds a diagnostics object with overridable fields for deriveStatus tests. */
function diag(overrides: Partial<ConnectionDiagnostics>): ConnectionDiagnostics {
  return {
    state: 'unknown',
    host: '127.0.0.1',
    port: 8642,
    discoveryEnabled: true,
    portRangeStart: 8642,
    portRangeEnd: 8649,
    allowOfflineSchema: true,
    debugSessionActive: false,
    ...overrides,
  };
}

describe('connection-diagnostics', () => {
  beforeEach(() => {
    resetMocks();
    vscodeMock.debug.activeDebugSession = undefined;
  });

  describe('gatherConnectionDiagnostics', () => {
    it('normalizes an unknown hint to "unknown"', () => {
      assert.strictEqual(gatherConnectionDiagnostics('nonsense').state, 'unknown');
      assert.strictEqual(gatherConnectionDiagnostics(undefined).state, 'unknown');
    });

    it('passes through a known state hint', () => {
      assert.strictEqual(gatherConnectionDiagnostics('offline').state, 'offline');
      assert.strictEqual(
        gatherConnectionDiagnostics('disconnected').state,
        'disconnected',
      );
    });

    it('captures the active debug session signal', () => {
      vscodeMock.debug.activeDebugSession = { type: 'flutter' };
      assert.strictEqual(gatherConnectionDiagnostics('offline').debugSessionActive, true);
    });

    it('reports no debug session when none is active', () => {
      assert.strictEqual(
        gatherConnectionDiagnostics('offline').debugSessionActive,
        false,
      );
    });
  });

  describe('deriveStatus', () => {
    it('connected → ok tone', () => {
      assert.strictEqual(deriveStatus(diag({ state: 'connected' })).tone, 'ok');
    });

    it('connecting → info tone', () => {
      assert.strictEqual(deriveStatus(diag({ state: 'connecting' })).tone, 'info');
    });

    it('offline → warn tone', () => {
      assert.strictEqual(deriveStatus(diag({ state: 'offline' })).tone, 'warn');
    });

    it('disconnected → error tone', () => {
      assert.strictEqual(
        deriveStatus(diag({ state: 'disconnected' })).tone,
        'error',
      );
    });

    it('offline with NO debug session → "start a debug session" next step', () => {
      const s = deriveStatus(diag({ state: 'offline', debugSessionActive: false }));
      assert.strictEqual(s.detailKey, 'panel.tools.trouble.status.next.noDebugSession');
    });

    it('offline WITH a debug session → "no server on port" next step', () => {
      const s = deriveStatus(diag({ state: 'offline', debugSessionActive: true }));
      assert.strictEqual(s.detailKey, 'panel.tools.trouble.status.next.noServer');
    });

    it('disconnected splits on the debug-session signal too', () => {
      assert.strictEqual(
        deriveStatus(diag({ state: 'disconnected', debugSessionActive: true })).detailKey,
        'panel.tools.trouble.status.next.noServer',
      );
      assert.strictEqual(
        deriveStatus(diag({ state: 'disconnected', debugSessionActive: false })).detailKey,
        'panel.tools.trouble.status.next.noDebugSession',
      );
    });

    it('unknown → info tone with generic guidance', () => {
      const s = deriveStatus(diag({ state: 'unknown' }));
      assert.strictEqual(s.tone, 'info');
      assert.strictEqual(s.titleKey, 'panel.tools.trouble.status.unknown.title');
    });
  });
});
