/**
 * Drift Advisor extension entry point.
 * Activates client, discovery, then delegates to setup modules for providers,
 * diagnostics, editing, and command registration.
 * Master switch: when driftViewer.enabled is false, discovery and watcher do not
 * start; re-enabling applies state via onDidChangeConfiguration.
 */

import * as vscode from 'vscode';
import { DriftApiClient } from './api-client';
import { AnnotationStore } from './annotations/annotation-store';
import { GenerationWatcher } from './generation-watcher';
import { ServerDiscovery } from './server-discovery';
import { ServerManager } from './server-manager';
import { SchemaIntelligence } from './engines/schema-intelligence';
import { QueryIntelligence } from './engines/query-intelligence';
import { DashboardPanel } from './dashboard/dashboard-panel';
import { updateStatusBar } from './status-bar';
import { HealthStatusBar } from './status-bar-health';
import { ToolsQuickPickStatusBar, registerToolsQuickPickCommand } from './status-bar-tools';
import { hasFlutterOrDartDebugSession, tryAdbForwardAndRetry } from './android-forward';
import { setupProviders } from './extension-providers';
import { setupDiagnostics } from './extension-diagnostics';
import { setupEditing } from './extension-editing';
import { registerAllCommands } from './extension-commands';
import { SchemaTracker } from './schema-timeline/schema-tracker';
import { PackageStatusMonitor } from './workspace-setup/package-status-monitor';

export function activate(context: vscode.ExtensionContext): void {
  const cfg = vscode.workspace.getConfiguration('driftViewer');
  const extensionEnabled = cfg.get<boolean>('enabled', true) !== false;
  void vscode.commands.executeCommand('setContext', 'driftViewer.enabled', extensionEnabled);

  const host = cfg.get<string>('host', '127.0.0.1') ?? '127.0.0.1';
  const port = cfg.get<number>('port', 8642) ?? 8642;

  const client = new DriftApiClient(host, port);
  const authToken = cfg.get<string>('authToken', '') ?? '';
  if (authToken) client.setAuthToken(authToken);
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('driftViewer.authToken')) {
        const token = vscode.workspace
          .getConfiguration('driftViewer')
          .get<string>('authToken', '') ?? '';
        client.setAuthToken(token || undefined);
      }
    }),
  );

  const watcher = new GenerationWatcher(client);
  const lastKnownPorts = context.workspaceState.get<number[]>('driftViewer.lastKnownPorts', []);
  const discovery = new ServerDiscovery({
    host,
    portRangeStart: cfg.get<number>('discovery.portRangeStart', 8642) ?? 8642,
    portRangeEnd: cfg.get<number>('discovery.portRangeEnd', 8649) ?? 8649,
    additionalPorts: lastKnownPorts,
  });
  const connectionChannel = vscode.window.createOutputChannel('Saropa Drift Advisor');
  context.subscriptions.push(connectionChannel);
  discovery.setLog(connectionChannel);
  watcher.setLog(connectionChannel);

  const serverManager = new ServerManager(discovery, client, context.workspaceState);
  serverManager.setShowLog(() => connectionChannel.show());
  const discoveryEnabled = cfg.get<boolean>('discovery.enabled', true) !== false;

  if (!extensionEnabled) {
    serverManager.clearActive();
  } else {
    if (discoveryEnabled) discovery.start();
  }
  context.subscriptions.push({ dispose: () => discovery.dispose() });
  context.subscriptions.push({ dispose: () => serverManager.dispose() });

  context.subscriptions.push(
    discovery.onDidChangeServers((servers) => {
      if (servers.length > 0) return;
      if (!hasFlutterOrDartDebugSession()) return;
      void tryAdbForwardAndRetry(client.port, discovery, context.workspaceState);
    }),
  );

  // When a Flutter/Dart debug session starts on an emulator, the server inside
  // the app needs adb port-forwarding before the host can reach it. Wait a few
  // seconds for the server to boot, then try adb forward if no server found.
  // The timer handle is tracked so it can be cancelled on deactivation,
  // preventing a stale callback from restarting the disposed discovery loop.
  const ADB_FORWARD_DELAY_MS = 5000;
  let adbForwardTimer: ReturnType<typeof setTimeout> | undefined;
  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession((session) => {
      const t = session.type?.toLowerCase() ?? '';
      if (t !== 'dart' && t !== 'flutter') return;
      // Cancel any pending timer from a previous session to avoid duplicates.
      if (adbForwardTimer !== undefined) clearTimeout(adbForwardTimer);
      adbForwardTimer = setTimeout(() => {
        adbForwardTimer = undefined;
        if (discovery.servers.length === 0) {
          void tryAdbForwardAndRetry(client.port, discovery, context.workspaceState);
        }
      }, ADB_FORWARD_DELAY_MS);
    }),
  );
  // Cancel pending adb-forward timer on deactivation to prevent polling leaks.
  context.subscriptions.push({
    dispose: () => {
      if (adbForwardTimer !== undefined) {
        clearTimeout(adbForwardTimer);
        adbForwardTimer = undefined;
      }
    },
  });

  // Session flag: only show the "Open Dashboard" prompt once per activation
  let dashboardPromptShown = false;

  // Monitor pubspec.yaml for package presence and version. Runs independently
  // of the master switch because the "Add Package" button visibility should
  // always reflect the actual pubspec state.
  const packageMonitor = new PackageStatusMonitor();
  packageMonitor.start();
  context.subscriptions.push(packageMonitor);

  const annotationStore = new AnnotationStore(context.workspaceState);
  const providers = setupProviders(context, client, annotationStore);

  // Sync package-installed state to the Drift Tools sidebar so the
  // "Add Package" tree item hides when the package is already in pubspec.
  context.subscriptions.push(
    packageMonitor.onDidChangeInstalled((installed) => {
      providers.toolsProvider.setPackageInstalled(installed);
    }),
  );

  // Schema intelligence engines for diagnostics and code actions.
  const schemaIntel = new SchemaIntelligence(client);
  const queryIntel = new QueryIntelligence(client);
  context.subscriptions.push(schemaIntel, queryIntel);

  // Schema timeline tracker: captures schema snapshots on each generation
  // change for use by the rollback generator and timeline panel.
  const schemaTracker = new SchemaTracker(client, context.workspaceState, watcher);
  context.subscriptions.push(schemaTracker);
  const { diagnosticManager } = setupDiagnostics(context, client, schemaIntel, queryIntel);

  const editing = setupEditing(context, client);
  editing.changeTracker.onDidChange(() => {
    vscode.commands.executeCommand('setContext', 'driftViewer.hasEdits', editing.changeTracker.changeCount > 0);
    vscode.commands.executeCommand('setContext', 'driftViewer.editingActive', editing.changeTracker.changeCount > 0);
    providers.logBridge.writeDataEdit(editing.changeTracker.lastLogMessage);
  });

  const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  const refreshStatusBar = (): void =>
    updateStatusBar(statusItem, discovery, serverManager, discoveryEnabled, client);
  refreshStatusBar();
  context.subscriptions.push(statusItem);

  // Health score status bar: hidden until first health check, click re-runs
  const healthStatusBar = new HealthStatusBar();
  context.subscriptions.push(healthStatusBar);

  // Drift Tools QuickPick status bar: visible when connected, opens command menu
  const toolsQuickPick = new ToolsQuickPickStatusBar();
  context.subscriptions.push(toolsQuickPick);
  registerToolsQuickPickCommand(context);

  /** Apply master switch: start/stop discovery and watcher, clear or refresh UI. */
  const applyEnabledState = (enabled: boolean): void => {
    void vscode.commands.executeCommand('setContext', 'driftViewer.enabled', enabled);
    if (!enabled) {
      discovery.stop();
      watcher.stop();
      serverManager.clearActive();
      providers.toolsProvider.setConnected(false);
      healthStatusBar.hide();
      toolsQuickPick.setConnected(false);
    } else {
      if (discoveryEnabled) discovery.start();
      watcher.start();
      providers.treeProvider.refresh();
      providers.codeLensProvider.refreshRowCounts();
      providers.linter.refresh();
      diagnosticManager.refresh().catch(() => {});
      providers.refreshBadges().catch(() => {});
    }
    refreshStatusBar();
  };

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('driftViewer.enabled')) {
        const enabled = vscode.workspace.getConfiguration('driftViewer').get<boolean>('enabled', true) !== false;
        applyEnabledState(enabled);
      }
    }),
  );

  serverManager.onDidChangeActive((server) => {
    refreshStatusBar();
    void vscode.commands.executeCommand('setContext', 'driftViewer.serverConnected', server !== undefined);
    // Keep the Drift Tools sidebar and status bar in sync with connection state
    providers.toolsProvider.setConnected(server !== undefined);
    toolsQuickPick.setConnected(server !== undefined);
    if (!server) {
      healthStatusBar.hide();
    }
    if (server) {
      watcher.stop();
      watcher.reset();
      watcher.start();
      providers.treeProvider.refresh();
      providers.codeLensProvider.refreshRowCounts();
      providers.linter.refresh();
      diagnosticManager.refresh().catch(() => {});
      providers.refreshBadges().catch(() => {});
      providers.watchManager.refresh().catch(() => {});

      // On first server connection per session, offer to open the Dashboard
      // so users discover the full feature set. Controlled by a config setting
      // and a per-workspace "don't show again" flag.
      if (!dashboardPromptShown) {
        dashboardPromptShown = true;
        const showOnConnect = vscode.workspace
          .getConfiguration('driftViewer')
          .get<boolean>('dashboard.showOnConnect', true);
        const suppressKey = 'driftViewer.suppressDashboardPrompt';
        const suppressed = context.workspaceState.get<boolean>(suppressKey, false);
        if (showOnConnect && !suppressed) {
          void vscode.window.showInformationMessage(
            'Drift server connected! Open the Dashboard to explore all features.',
            'Open Dashboard',
            "Don't Show Again",
          ).then((choice) => {
            if (choice === 'Open Dashboard') {
              vscode.commands.executeCommand('driftViewer.openDashboard');
            } else if (choice === "Don't Show Again") {
              context.workspaceState.update(suppressKey, true);
            }
          });
        }
      }
    }
  });
  discovery.onDidChangeServers(refreshStatusBar);

  // On generation change: refresh tree, codelens, linter, diagnostics, badges, timeline, watch, dashboard. Fire-and-forget async to avoid blocking.
  watcher.onDidChange(async () => {
    providers.treeProvider.refresh();
    providers.definitionProvider.clearCache();
    providers.hoverCache.clear();
    await providers.codeLensProvider.refreshRowCounts();
    providers.codeLensProvider.notifyChange();
    providers.linter.refresh();
    diagnosticManager.refresh().catch(() => {});
    providers.refreshBadges().catch(() => {});
    if (cfg.get<boolean>('timeline.autoCapture', true)) {
      providers.snapshotStore.capture(client).catch(() => {});
    }
    providers.watchManager.refresh().catch(() => {});
    providers.dbpProvider.onGenerationChange().catch(() => {});
    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel.refreshAll().catch(() => {});
    }
  });
  if (extensionEnabled) {
    watcher.start();
    providers.treeProvider.refresh();
    providers.codeLensProvider.refreshRowCounts();
    providers.linter.refresh();
    diagnosticManager.refresh().catch(() => {});
    providers.refreshBadges().catch(() => {});
  }
  context.subscriptions.push({ dispose: () => watcher.stop() });

  registerAllCommands(context, client, {
    ...providers,
    ...editing,
    annotationStore,
    statusItem,
    discovery,
    serverManager,
    discoveryEnabled,
    watcher,
    schemaTracker,
    updateStatusBar: refreshStatusBar,
    connectionChannel,
    healthStatusBar,
  });
}

export function deactivate(): void {}
