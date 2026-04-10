/**
 * Connection bootstrap: creates and wires API client, discovery, watcher,
 * and server manager. Pushes all related subscriptions onto the extension context.
 * Used by extension.ts so activation stays under the file-line limit.
 */

import * as vscode from 'vscode';
import { DriftApiClient } from './api-client';
import { GenerationWatcher } from './generation-watcher';
import { ServerDiscovery } from './server-discovery';
import { ServerManager } from './server-manager';
import { hasFlutterOrDartDebugSession, tryAdbForwardAndRetry } from './android-forward';
import { isDriftUiConnected } from './connection-ui-state';
import { workspaceUsesDrift } from './diagnostics/dart-file-parser';
import { getLogVerbosity, shouldLogConnectionLine } from './log-verbosity';

/** Delay before trying adb forward after a Flutter/Dart debug session starts (ms). */
const ADB_FORWARD_DELAY_MS = 5000;

/** Builds headers for discovery HTTP probes so they match [DriftApiClient] when Bearer auth is set. */
function discoveryAuthHeadersFromToken(
  token: string | undefined,
): Record<string, string> | undefined {
  if (!token || token.length === 0) return undefined;
  return { Authorization: `Bearer ${token}` };
}

export interface ExtensionBootstrapResult {
  client: DriftApiClient;
  watcher: GenerationWatcher;
  discovery: ServerDiscovery;
  serverManager: ServerManager;
  discoveryEnabled: boolean;
  extensionEnabled: boolean;
  cfg: vscode.WorkspaceConfiguration;
}

/**
 * Creates the connection layer (client, discovery, watcher, server manager),
 * wires auth and discovery listeners including adb forward on debug start,
 * and registers all related disposables. Call once from activate().
 * Watcher is not started here; extension.ts starts it when extensionEnabled.
 */
export function bootstrapExtension(
  context: vscode.ExtensionContext,
  connectionChannel: vscode.OutputChannel,
): ExtensionBootstrapResult {
  const cfg = vscode.workspace.getConfiguration('driftViewer');
  const extensionEnabled = cfg.get<boolean>('enabled', true) !== false;
  void vscode.commands.executeCommand('setContext', 'driftViewer.enabled', extensionEnabled);
  let logVerbosity = getLogVerbosity(cfg);

  const host = cfg.get<string>('host', '127.0.0.1') ?? '127.0.0.1';
  const port = cfg.get<number>('port', 8642) ?? 8642;

  const client = new DriftApiClient(host, port);
  const authToken = cfg.get<string>('authToken', '') ?? '';
  if (authToken) client.setAuthToken(authToken);

  const watcher = new GenerationWatcher(client);
  const lastKnownPorts = context.workspaceState.get<number[]>('driftViewer.lastKnownPorts', []);
  const discovery = new ServerDiscovery({
    host,
    portRangeStart: cfg.get<number>('discovery.portRangeStart', 8642) ?? 8642,
    portRangeEnd: cfg.get<number>('discovery.portRangeEnd', 8649) ?? 8649,
    additionalPorts: lastKnownPorts,
    authHeaders: discoveryAuthHeadersFromToken(authToken || undefined),
  });

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      const driftCfg = vscode.workspace.getConfiguration('driftViewer');
      if (e.affectsConfiguration('driftViewer.authToken')) {
        const token = driftCfg.get<string>('authToken', '') ?? '';
        client.setAuthToken(token || undefined);
        discovery.setAuthHeaders(discoveryAuthHeadersFromToken(token || undefined));
      }
      if (e.affectsConfiguration('driftViewer.logVerbosity')) {
        logVerbosity = getLogVerbosity(driftCfg);
      }
    }),
  );
  // connectionChannel is created by activate() and passed in so it's available
  // for phase logging before bootstrap runs.
  const gatedConnectionLog = {
    appendLine: (msg: string): void => {
      if (shouldLogConnectionLine(msg, logVerbosity)) {
        connectionChannel.appendLine(msg);
      }
    },
  };
  discovery.setLog(gatedConnectionLog);
  watcher.setLog(gatedConnectionLog);

  const serverManager = new ServerManager(discovery, client, context.workspaceState);
  discovery.setOnAfterOpenUrlFromNotification((h, p) => {
    serverManager.ensureActiveForDiscoveredPort(h, p);
  });
  serverManager.setShowLog(() => connectionChannel.show());
  serverManager.setLog((msg) => {
    const line = `[${new Date().toISOString()}] ${msg}`;
    if (shouldLogConnectionLine(line, logVerbosity)) {
      connectionChannel.appendLine(line);
    }
  });
  const discoveryEnabled = cfg.get<boolean>('discovery.enabled', true) !== false;

  if (!extensionEnabled) {
    serverManager.clearActive();
  } else if (discoveryEnabled) {
    // Only scan for Drift debug servers in workspaces that actually use Drift.
    // Without this gate, every VS Code workspace triggers port scanning and
    // stale "no longer responding" toasts even for non-Drift projects.
    void workspaceUsesDrift().then((isDrift) => {
      if (isDrift) discovery.start();
    });
  }
  context.subscriptions.push({ dispose: () => discovery.dispose() });
  context.subscriptions.push({ dispose: () => serverManager.dispose() });

  context.subscriptions.push(
    discovery.onDidChangeServers((servers) => {
      if (servers.length > 0) {
        // Backup sync: ensure sidebar context reflects active server (ServerManager listener
        // runs first, so activeServer is set by the time we run). Handles races where
        // the view evaluated before onDidChangeActive or the context update was missed.
        void vscode.commands.executeCommand(
          'setContext',
          'driftViewer.serverConnected',
          isDriftUiConnected(serverManager, client),
        );
        return;
      }
      if (!hasFlutterOrDartDebugSession()) return;
      void tryAdbForwardAndRetry(client.port, discovery, context.workspaceState);
    }),
  );

  // When a Flutter/Dart debug session starts on an emulator, the server inside
  // the app needs adb port-forwarding before the host can reach it. Wait a few
  // seconds for the server to boot, then try adb forward if no server found.
  // The timer handle is tracked so it can be cancelled on deactivation,
  // preventing a stale callback from restarting the disposed discovery loop.
  let adbForwardTimer: ReturnType<typeof setTimeout> | undefined;
  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession((session) => {
      const t = session.type?.toLowerCase() ?? '';
      if (t !== 'dart' && t !== 'flutter') return;
      if (adbForwardTimer !== undefined) clearTimeout(adbForwardTimer);
      adbForwardTimer = setTimeout(() => {
        adbForwardTimer = undefined;
        if (discovery.servers.length === 0) {
          void tryAdbForwardAndRetry(client.port, discovery, context.workspaceState);
        }
      }, ADB_FORWARD_DELAY_MS);
    }),
  );
  context.subscriptions.push({
    dispose: () => {
      if (adbForwardTimer !== undefined) {
        clearTimeout(adbForwardTimer);
        adbForwardTimer = undefined;
      }
    },
  });

  return {
    client,
    watcher,
    discovery,
    serverManager,
    discoveryEnabled,
    extensionEnabled,
    cfg,
  };
}
