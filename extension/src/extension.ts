/**
 * Drift Advisor extension entry point.
 * Delegates to extension-bootstrap for client, discovery, watcher, and server manager;
 * then sets up providers, diagnostics, editing, status bars, and command registration.
 * Master switch: when driftViewer.enabled is false, discovery and watcher do not
 * start; re-enabling applies state via onDidChangeConfiguration.
 */

import * as vscode from 'vscode';
import { AnnotationStore } from './annotations/annotation-store';
import { DashboardPanel } from './dashboard/dashboard-panel';
import { SchemaIntelligence } from './engines/schema-intelligence';
import { QueryIntelligence } from './engines/query-intelligence';
import { updateStatusBar } from './status-bar';
import { HealthStatusBar } from './status-bar-health';
import { ToolsQuickPickStatusBar, registerToolsQuickPickCommand } from './status-bar-tools';
import { setupProviders } from './extension-providers';
import { setupDiagnostics } from './extension-diagnostics';
import { setupEditing } from './extension-editing';
import { registerAllCommands } from './extension-commands';
import { bootstrapExtension } from './extension-bootstrap';
import { SchemaTracker } from './schema-timeline/schema-tracker';
import { PackageStatusMonitor } from './workspace-setup/package-status-monitor';

export function activate(context: vscode.ExtensionContext): void {
  const {
    client,
    watcher,
    discovery,
    serverManager,
    connectionChannel,
    discoveryEnabled,
    extensionEnabled,
    cfg,
  } = bootstrapExtension(context);

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

  // Delayed sync so sidebar "connected" state catches up if discovery found a server
  // before the view evaluated (avoids "Found servers on ports: X" but sidebar still "No server").
  const syncContextTimeout = setTimeout(() => {
    const active = serverManager.activeServer;
    void vscode.commands.executeCommand(
      'setContext',
      'driftViewer.serverConnected',
      active !== undefined,
    );
  }, 1500);
  context.subscriptions.push({
    dispose: () => clearTimeout(syncContextTimeout),
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
