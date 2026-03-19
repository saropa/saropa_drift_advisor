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
import { setupProviders, type LogCaptureIssuesRef } from './extension-providers';
import { setupDiagnostics } from './extension-diagnostics';
import { setupEditing } from './extension-editing';
import { registerAllCommands } from './extension-commands';
import { bootstrapExtension } from './extension-bootstrap';
import { SchemaTracker } from './schema-timeline/schema-tracker';
import { PackageStatusMonitor } from './workspace-setup/package-status-monitor';
import { SchemaCache } from './schema-cache/schema-cache';
import { createCachedDriftClient } from './schema-cache/cached-drift-client';
import type { DriftAdvisorApi } from './log-capture-api';
import { createDriftAdvisorApi } from './log-capture-api';

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

  const schemaCache = new SchemaCache(client, context.workspaceState, {
    ttlMs: cfg.get<number>('schemaCache.ttlMs', 30_000) ?? 30_000,
    persistKey: cfg.get<string>('schemaCache.persistKey', 'driftViewer.lastKnownSchema') || undefined,
  });
  const cachedClient = createCachedDriftClient(client, schemaCache);
  const loadOnConnect = cfg.get<boolean>('database.loadOnConnect', true) !== false;
  let treeLoadedLazy = false;
  const getLightweight = (): boolean =>
    vscode.workspace.getConfiguration('driftViewer').get<boolean>('lightweight', false) === true;

  // Session flag: only show the "Open Dashboard" prompt once per activation
  let dashboardPromptShown = false;

  // Monitor pubspec.yaml for package presence and version. Runs independently
  // of the master switch because the "Add Package" button visibility should
  // always reflect the actual pubspec state.
  const packageMonitor = new PackageStatusMonitor();
  packageMonitor.start();
  context.subscriptions.push(packageMonitor);

  const annotationStore = new AnnotationStore(context.workspaceState);
  // Ref populated after setupDiagnostics so the log bridge can include diagnostic issues in session export.
  const issuesRef: LogCaptureIssuesRef = { get: () => [] };
  const providers = setupProviders(context, cachedClient, annotationStore, issuesRef);

  // Stale-while-revalidate: when cache updates (e.g. after background revalidate), refresh tree.
  // Sync package-installed state to the Drift Tools sidebar so the
  // "Add Package" tree item hides when the package is already in pubspec.
  context.subscriptions.push(
    schemaCache.onDidUpdate(() => {
      providers.treeProvider.refresh();
    }),
    packageMonitor.onDidChangeInstalled((installed) => {
      providers.toolsProvider.setPackageInstalled(installed);
    }),
  );

  // Schema intelligence engines for diagnostics and code actions.
  const schemaIntel = new SchemaIntelligence(cachedClient);
  const queryIntel = new QueryIntelligence(cachedClient);
  context.subscriptions.push(schemaIntel, queryIntel);

  // Schema timeline tracker: captures schema snapshots on each generation
  // change for use by the rollback generator and timeline panel.
  const schemaTracker = new SchemaTracker(cachedClient, context.workspaceState, watcher);
  context.subscriptions.push(schemaTracker);
  const { diagnosticManager } = setupDiagnostics(context, cachedClient, schemaIntel, queryIntel);
  issuesRef.get = () => diagnosticManager.getLastCollectedIssues();

  // Public API for other extensions (e.g. Saropa Log Capture): getSessionSnapshot()
  (context as vscode.ExtensionContext & { exports: DriftAdvisorApi }).exports = createDriftAdvisorApi(
    () => (serverManager.activeServer ? cachedClient : null),
    () => issuesRef.get(),
  );

  const editing = setupEditing(context, cachedClient);
  editing.changeTracker.onDidChange(() => {
    vscode.commands.executeCommand('setContext', 'driftViewer.hasEdits', editing.changeTracker.changeCount > 0);
    vscode.commands.executeCommand('setContext', 'driftViewer.editingActive', editing.changeTracker.changeCount > 0);
    providers.logBridge.writeDataEdit(editing.changeTracker.lastLogMessage);
  });

  const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  const refreshStatusBar = (): void =>
    updateStatusBar(statusItem, discovery, serverManager, discoveryEnabled, cachedClient);
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
    if (enabled) {
      if (discoveryEnabled) discovery.start();
      watcher.start();
      if (loadOnConnect) void providers.treeProvider.refresh();
      providers.codeLensProvider.refreshRowCounts();
      providers.linter.refresh();
      diagnosticManager.refresh().catch(() => {});
      if (!getLightweight()) providers.refreshBadges().catch(() => {});
    } else {
      discovery.stop();
      watcher.stop();
      serverManager.clearActive();
      schemaCache.invalidate();
      providers.toolsProvider.setConnected(false);
      healthStatusBar.hide();
      toolsQuickPick.setConnected(false);
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
    schemaCache.invalidate();
    void vscode.commands.executeCommand('setContext', 'driftViewer.serverConnected', server !== undefined);
    providers.toolsProvider.setConnected(server !== undefined);
    toolsQuickPick.setConnected(server !== undefined);
    if (!server) {
      healthStatusBar.hide();
      treeLoadedLazy = false;
    }
    if (server) {
      watcher.stop();
      watcher.reset();
      watcher.start();
      schemaCache.prewarm();
      if (loadOnConnect) void providers.treeProvider.refresh();
      providers.codeLensProvider.refreshRowCounts();
      providers.linter.refresh();
      diagnosticManager.refresh().catch(() => {});
      if (!getLightweight()) providers.refreshBadges().catch(() => {});
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

  // Lazy tree: when loadOnConnect is false, load Database tree on first view visibility.
  if (typeof providers.treeView.onDidChangeVisibility === 'function') {
    context.subscriptions.push(
      providers.treeView.onDidChangeVisibility((e: { visible: boolean }) => {
        if (e.visible && !loadOnConnect && !treeLoadedLazy && serverManager.activeServer) {
          treeLoadedLazy = true;
          void providers.treeProvider.refresh();
        }
      }),
    );
  }

  // On generation change: invalidate schema cache; refresh tree/codelens/linter etc. unless lightweight.
  watcher.onDidChange(async () => {
    schemaCache.invalidate();
    if (!getLightweight()) {
      void providers.treeProvider.refresh();
      providers.definitionProvider.clearCache();
      providers.hoverCache.clear();
      await providers.codeLensProvider.refreshRowCounts();
      providers.codeLensProvider.notifyChange();
      providers.linter.refresh();
      diagnosticManager.refresh().catch(() => {});
      providers.refreshBadges().catch(() => {});
      if (vscode.workspace.getConfiguration('driftViewer').get<boolean>('timeline.autoCapture', true)) {
        providers.snapshotStore.capture(cachedClient).catch(() => {});
      }
      providers.watchManager.refresh().catch(() => {});
      if (DashboardPanel.currentPanel) {
        DashboardPanel.currentPanel.refreshAll().catch(() => {});
      }
    }
    providers.dbpProvider.onGenerationChange().catch(() => {});
  });
  if (extensionEnabled) {
    watcher.start();
    if (loadOnConnect) {
      void providers.treeProvider.refresh();
    }
    if (serverManager.activeServer) {
      schemaCache.prewarm();
    }
    providers.codeLensProvider.refreshRowCounts();
    providers.linter.refresh();
    diagnosticManager.refresh().catch(() => {});
    if (!getLightweight()) providers.refreshBadges().catch(() => {});
  }
  context.subscriptions.push({ dispose: () => watcher.stop() });

  registerAllCommands(context, cachedClient, {
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

/**
 * Called when the extension is deactivated. Cleanup is handled by
 * context.subscriptions (each Disposable is disposed by VS Code).
 */
export function deactivate(): void {
  return;
}
