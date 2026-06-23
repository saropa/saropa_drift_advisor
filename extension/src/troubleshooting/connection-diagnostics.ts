/**
 * Live connection diagnostics for the Troubleshooting panel.
 *
 * The panel used to be static — it only knew the configured port and printed
 * generic tips. That left a user staring at "Offline" with no idea WHY. This
 * module gathers the state the extension actually knows (configuration + whether
 * a Flutter/Dart debug session is attached) and derives a precise status header
 * and a single concrete next step, so the panel reads like a connection
 * dashboard instead of a help article.
 *
 * No shell-outs: everything here comes from VS Code APIs, so opening the panel
 * is instant and cannot hang on a slow `adb`. Device/port probing stays in the
 * existing discovery path; the panel surfaces its OUTCOME (the state hint) rather
 * than re-running it.
 */

import * as vscode from 'vscode';
import { hasFlutterOrDartDebugSession } from '../android-forward';

/**
 * The connection state the panel renders for. Mirrors the four
 * {@link ConnectionPhase} values plus `unknown` for entry points (e.g. the
 * Tools list) that open the panel without a phase in hand.
 */
export type DiagnosticState =
  | 'offline'
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'unknown';

/** Everything the panel needs to render its live header and configuration grid. */
export interface ConnectionDiagnostics {
  state: DiagnosticState;
  /** Configured target host (`driftViewer.host`, default 127.0.0.1). */
  host: string;
  /** Configured target port (`driftViewer.port`, default 8642). */
  port: number;
  /** Whether HTTP port-scan discovery is enabled (`driftViewer.discovery.enabled`). */
  discoveryEnabled: boolean;
  /** Inclusive discovery scan range start (`driftViewer.discovery.portRangeStart`). */
  portRangeStart: number;
  /** Inclusive discovery scan range end (`driftViewer.discovery.portRangeEnd`). */
  portRangeEnd: number;
  /** Whether the tree may fall back to cached schema (`driftViewer.database.allowOfflineSchema`). */
  allowOfflineSchema: boolean;
  /** A Dart/Flutter debug session is attached (so the VM-service transport is possible). */
  debugSessionActive: boolean;
}

/** Maps a raw command argument to a known state, defaulting to `unknown`. */
function normalizeState(hint?: unknown): DiagnosticState {
  if (
    hint === 'offline' ||
    hint === 'disconnected' ||
    hint === 'connecting' ||
    hint === 'connected'
  ) {
    return hint;
  }
  return 'unknown';
}

/**
 * Reads the current configuration + debug-session signal into a diagnostics
 * snapshot. [stateHint] is the connection phase the caller knows (the tree row
 * passes `'offline'` / `'disconnected'`); omit it when the phase is unknown.
 */
export function gatherConnectionDiagnostics(
  stateHint?: unknown,
): ConnectionDiagnostics {
  const cfg = vscode.workspace.getConfiguration('driftViewer');
  // Default the scan range off the configured port so a non-default port still
  // yields a sensible "ports N..N+7" hint when the range keys are unset.
  const port = cfg.get<number>('port', 8642) ?? 8642;
  return {
    state: normalizeState(stateHint),
    host: cfg.get<string>('host', '127.0.0.1') ?? '127.0.0.1',
    port,
    discoveryEnabled: cfg.get<boolean>('discovery.enabled', true) ?? true,
    portRangeStart: cfg.get<number>('discovery.portRangeStart', port) ?? port,
    portRangeEnd: cfg.get<number>('discovery.portRangeEnd', port + 7) ?? port + 7,
    allowOfflineSchema:
      cfg.get<boolean>('database.allowOfflineSchema', true) ?? true,
    debugSessionActive: hasFlutterOrDartDebugSession(),
  };
}

/** Visual tone for the status banner, mapped to a CSS class + theme color. */
export type StatusTone = 'ok' | 'info' | 'warn' | 'error';

/** The derived header: tone plus the l10n keys the HTML builder resolves. */
export interface StatusDescriptor {
  tone: StatusTone;
  /** l10n key for the one-line status title. */
  titleKey: string;
  /** l10n key for the concrete next-step sentence. */
  detailKey: string;
}

/**
 * Derives the status header from a snapshot. This is the diagnostic core: for a
 * non-working state it splits on whether a debug session is attached, because
 * that distinguishes the two real causes — "no debugger, so no transport at all"
 * (start one with F5) versus "debugger attached but nothing is serving on the
 * port" (the app never called `DriftDebugServer.start()`, or the build is
 * profile/release so `enabled: kDebugMode` is false).
 */
export function deriveStatus(diag: ConnectionDiagnostics): StatusDescriptor {
  switch (diag.state) {
    case 'connected':
      return {
        tone: 'ok',
        titleKey: 'panel.tools.trouble.status.connected.title',
        detailKey: 'panel.tools.trouble.status.connected.detail',
      };
    case 'connecting':
      return {
        tone: 'info',
        titleKey: 'panel.tools.trouble.status.connecting.title',
        detailKey: 'panel.tools.trouble.status.connecting.detail',
      };
    case 'offline':
      return {
        tone: 'warn',
        titleKey: 'panel.tools.trouble.status.offline.title',
        detailKey: diag.debugSessionActive
          ? 'panel.tools.trouble.status.next.noServer'
          : 'panel.tools.trouble.status.next.noDebugSession',
      };
    case 'disconnected':
      return {
        tone: 'error',
        titleKey: 'panel.tools.trouble.status.disconnected.title',
        detailKey: diag.debugSessionActive
          ? 'panel.tools.trouble.status.next.noServer'
          : 'panel.tools.trouble.status.next.noDebugSession',
      };
    default:
      return {
        tone: 'info',
        titleKey: 'panel.tools.trouble.status.unknown.title',
        detailKey: 'panel.tools.trouble.status.unknown.detail',
      };
  }
}
