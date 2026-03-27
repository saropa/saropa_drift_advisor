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
import { registerAboutCommands } from './about/about-commands';
import { registerRefreshTreeCommand } from './tree/tree-commands';
import {
  isDriftUiConnected,
  refreshDriftConnectionUi as syncDriftConnectionUi,
} from './connection-ui-state';
import { bootstrapExtension } from './extension-bootstrap';
import { SchemaTracker } from './schema-timeline/schema-tracker';
import { PackageStatusMonitor } from './workspace-setup/package-status-monitor';
import { SchemaCache } from './schema-cache/schema-cache';
import { createCachedDriftClient } from './schema-cache/cached-drift-client';
import type { DriftAdvisorApi } from './log-capture-api';
import { createDriftAdvisorApi } from './log-capture-api';
import { getLogVerbosity, shouldLogConnectionLine } from './log-verbosity';

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

  // Register zero-dependency commands immediately so sidebar title actions work even if
  // a later synchronous setup step throws before registerAllCommands completes.
  registerAboutCommands(context);

  const schemaCache = new SchemaCache(client, context.workspaceState, {
    ttlMs: cfg.get<number>('schemaCache.ttlMs', 30_000) ?? 30_000,
    persistKey: cfg.get<string>('schemaCache.persistKey', 'driftViewer.lastKnownSchema') || undefined,
  });
  const cachedClient = createCachedDriftClient(client, schemaCache);
  const loadOnConnect = cfg.get<boolean>('database.loadOnConnect', true) !== false;
  let treeLoadedLazy = false;
  const getLightweight = (): boolean =>
    vscode.workspace.getConfiguration('driftViewer').get<boolean>('lightweight', false) === true;

  let dashboardPromptShown = false;
  const packageMonitor = new PackageStatusMonitor();
  packageMonitor.start();
  context.subscriptions.push(packageMonitor);

  const annotationStore = new AnnotationStore(context.workspaceState);
  const issuesRef: LogCaptureIssuesRef = { get: () => [] };
  const providers = setupProviders(context, cachedClient, annotationStore, issuesRef);
  registerRefreshTreeCommand(context, providers.treeProvider);

  context.subscriptions.push(
    packageMonitor.onDidChangeInstalled((installed) => {
      providers.toolsProvider.setPackageInstalled(installed);
    }),
  );

  const schemaIntel = new SchemaIntelligence(cachedClient);
  const queryIntel = new QueryIntelligence(cachedClient);
  context.subscriptions.push(schemaIntel, queryIntel);

  const schemaTracker = new SchemaTracker(cachedClient, context.workspaceState, watcher);
  context.subscriptions.push(schemaTracker);
  const { diagnosticManager } = setupDiagnostics(context, cachedClient, schemaIntel, queryIntel);
  issuesRef.get = () => diagnosticManager.getLastCollectedIssues();

  (context as vscode.ExtensionContext & { exports: DriftAdvisorApi }).exports = createDriftAdvisorApi(
    () => (isDriftUiConnected(serverManager, cachedClient) ? cachedClient : null),
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

  const healthStatusBar = new HealthStatusBar();
  context.subscriptions.push(healthStatusBar);

  const toolsQuickPick = new ToolsQuickPickStatusBar();
  context.subscriptions.push(toolsQuickPick);
  registerToolsQuickPickCommand(context);

  const connectionUiRefresh: { fn?: () => void } = {};
  connectionUiRefresh.fn = () =>
    syncDriftConnectionUi(serverManager, cachedClient, {
      toolsProvider: providers.toolsProvider,
      schemaSearchProvider: providers.schemaSearchProvider,
      treeProvider: providers.treeProvider,
      schemaCache,
    }, {
      appendLine: (msg: string) => {
        if (shouldLogConnectionLine(msg, getLogVerbosity())) {
          connectionChannel.appendLine(msg);
        }
      },
    });
  providers.treeProvider.postRefreshHook = () => connectionUiRefresh.fn?.();
  context.subscriptions.push(
    schemaCache.onDidUpdate(() => {
      void providers.treeProvider.refresh();
    }),
  );

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
    refreshDriftConnectionUi: () => connectionUiRefresh.fn?.(),
  });
  providers.schemaSearchProvider.attachDiscoveryMonitor(discovery);
  context.subscriptions.push({
    dispose: () => {
      providers.schemaSearchProvider.disposeDiscoveryMonitor();
    },
  });
  connectionUiRefresh.fn();
  context.subscriptions.push(
    cachedClient.onVmTransportChanged(() => connectionUiRefresh.fn?.()),
  );

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
      connectionUiRefresh.fn?.();
    } else {
      discovery.stop();
      watcher.stop();
      serverManager.clearActive();
      schemaCache.invalidate();
      healthStatusBar.hide();
      toolsQuickPick.hide();
      connectionUiRefresh.fn?.();
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
    connectionUiRefresh.fn?.();
    if (isDriftUiConnected(serverManager, cachedClient)) {
      toolsQuickPick.show();
    } else {
      toolsQuickPick.hide();
    }
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

  const syncContextTimeout = setTimeout(() => {
    connectionUiRefresh.fn?.();
  }, 1500);
  context.subscriptions.push({
    dispose: () => clearTimeout(syncContextTimeout),
  });

  discovery.onDidChangeServers(() => {
    refreshStatusBar();
    connectionUiRefresh.fn?.();
  });

  if (typeof providers.treeView.onDidChangeVisibility === 'function') {
    context.subscriptions.push(
      providers.treeView.onDidChangeVisibility((e: { visible: boolean }) => {
        if (e.visible && !loadOnConnect && !treeLoadedLazy && isDriftUiConnected(serverManager, cachedClient)) {
          treeLoadedLazy = true;
          void providers.treeProvider.refresh();
        }
      }),
    );
  }

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
    if (isDriftUiConnected(serverManager, cachedClient)) {
      schemaCache.prewarm();
    }
    providers.codeLensProvider.refreshRowCounts();
    providers.linter.refresh();
    diagnosticManager.refresh().catch(() => {});
    if (!getLightweight()) providers.refreshBadges().catch(() => {});
  }
  context.subscriptions.push({ dispose: () => watcher.stop() });
}

/** Called when the extension is deactivated. */
export function deactivate(): void {
  return;
}
