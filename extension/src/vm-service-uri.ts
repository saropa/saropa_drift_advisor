/**
 * Resolve the Dart VM Service WebSocket URI from an active Dart/Flutter debug session (Plan 68).
 * Tries customRequest, configuration, and parsing debug adapter output (e.g. "available at: http://127.0.0.1:port/id/").
 */

import * as vscode from 'vscode';

/** Regex: HTTP or WS VM Service URL as printed by Flutter/Dart (e.g. http://127.0.0.1:56083/abc/ or ws://.../ws). */
const VM_SERVICE_URL_RE =
  /(?:https?|wss?):\/\/[0-9.]+:\d+\/[^\s'")\]]+(?:\/ws)?/gi;

/**
 * Parse a line or chunk of debug output for a Dart VM Service URI.
 * Flutter often prints "available at: http://127.0.0.1:PORT/TOKEN/"; WebSocket is ws://HOST:PORT/TOKEN/ws.
 * Returns the WebSocket URI, or undefined if none found.
 */
export function parseVmServiceUriFromOutput(text: string): string | undefined {
  const match = VM_SERVICE_URL_RE.exec(text);
  if (!match) return undefined;
  let raw = match[0];
  VM_SERVICE_URL_RE.lastIndex = 0;
  if (raw.startsWith('ws')) return raw;
  if (raw.startsWith('http')) {
    raw = raw.replace(/^https?/, 'ws');
    if (!raw.endsWith('/ws')) raw += (raw.endsWith('/') ? '' : '/') + 'ws';
    return raw;
  }
  return undefined;
}

/** Attempt to get VM Service WebSocket URI for the given debug session. Returns undefined if not available. */
export async function getVmServiceUri(
  session: vscode.DebugSession,
): Promise<string | undefined> {
  if (session.type !== 'dart' && session.type !== 'flutter') {
    return undefined;
  }
  // Try customRequest; Dart-Code and similar adapters may expose the VM URI.
  const tried = ['getVmServiceUri', 'vmServiceUri', 'getDebuggerUri'];
  for (const request of tried) {
    try {
      const result = await session.customRequest(request);
      if (result && typeof result === 'object') {
        const uri =
          (result as { vmServiceUri?: string; uri?: string; wsUri?: string })
            .vmServiceUri ??
          (result as { uri?: string }).uri ??
          (result as { wsUri?: string }).wsUri;
        if (typeof uri === 'string' && uri.startsWith('ws')) {
          return uri;
        }
      }
      if (typeof result === 'string' && result.startsWith('ws')) {
        return result;
      }
    } catch {
      // Adapter doesn't support this request; try next.
    }
  }
  // Fallback: some adapters put the URI in configuration.
  const cfg = session.configuration as { vmServiceUri?: string } | undefined;
  if (cfg?.vmServiceUri && cfg.vmServiceUri.startsWith('ws')) {
    return cfg.vmServiceUri;
  }
  return undefined;
}

/** Return the first active Dart/Flutter debug session, if any. */
export function getDartOrFlutterSession(): vscode.DebugSession | undefined {
  return vscode.debug.activeDebugSession && (vscode.debug.activeDebugSession.type === 'dart' || vscode.debug.activeDebugSession.type === 'flutter')
    ? vscode.debug.activeDebugSession
    : undefined;
}

/**
 * Register a listener that parses Dart/Flutter debug adapter output for VM Service URIs.
 * When one is found, calls onVmUriFound(session, wsUri). Use this when getVmServiceUri()
 * returns undefined (adapter doesn't expose URI). Add returned disposables to context.subscriptions.
 */
export function registerVmServiceOutputListener(
  onVmUriFound: (session: vscode.DebugSession, wsUri: string) => void,
): vscode.Disposable[] {
  const reported = new Set<string>();

  const createTracker = (session: vscode.DebugSession) => {
    let buffer = '';
    return {
      onOutput(output: string): void {
        buffer += output;
        const uri = parseVmServiceUriFromOutput(buffer);
        if (uri && !reported.has(session.id)) {
          reported.add(session.id);
          onVmUriFound(session, uri);
        }
        if (buffer.length > 4096) buffer = buffer.slice(-2048);
      },
    } as any;
  };

  const dart = vscode.debug.registerDebugAdapterTrackerFactory('dart', {
    createDebugAdapterTracker(session: vscode.DebugSession) {
      return createTracker(session);
    },
  });
  const flutter = vscode.debug.registerDebugAdapterTrackerFactory('flutter', {
    createDebugAdapterTracker(session: vscode.DebugSession) {
      return createTracker(session);
    },
  });
  return [dart, flutter];
}
