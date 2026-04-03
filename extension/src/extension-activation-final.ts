/**
 * Late activation phases: status bars, command registration, and event wiring.
 * Extracted from extension-main to keep files under the line cap.
 */
import * as vscode from 'vscode';
import { updateStatusBar } from './status-bar';
import { HealthStatusBar } from './status-bar-health';
import { ToolsQuickPickStatusBar, registerToolsQuickPickCommand } from './status-bar-tools';
import { registerAllCommands } from './extension-commands';
import {
  isDriftUiConnected,
  refreshDriftConnectionUi as syncDriftConnectionUi,
} from './connection-ui-state';
import { DashboardPanel } from './dashboard/dashboard-panel';
import { getLogVerbosity, shouldLogConnectionLine } from './log-verbosity';
import type { SchemaCache } from './schema-cache/schema-cache';
import type { ServerDiscovery } from './server-discovery';
import type { ServerManager } from './server-manager';
import type { AnnotationStore } from './annotations/annotation-store';
import { SchemaTracker } from './schema-timeline/schema-tracker';
import type { DriftApiClient } from './api-client';
import type { GenerationWatcher } from './generation-watcher';
import type { setupProviders } from './extension-providers';
import type { setupEditing } from './extension-editing';
import type { setupDiagnostics } from './extension-diagnostics';
import { ts, runPhase } from './extension-phase-utils';

/** Dependencies for final activation phases (8–10). */
export interface FinalPhaseDeps {
  context: vscode.ExtensionContext;
  channel: vscode.OutputChannel;
  cachedClient: DriftApiClient;
  schemaCache: SchemaCache;
  discovery: ServerDiscovery;
  serverManager: ServerManager;
  discoveryEnabled: boolean;
  extensionEnabled: boolean;
  watcher: GenerationWatcher;
  providers?: ReturnType<typeof setupProviders>;
  editing?: ReturnType<typeof setupEditing>;
  diagnostics?: ReturnType<typeof setupDiagnostics>;
  annotationStore: AnnotationStore;
  schemaTracker?: SchemaTracker;
  loadOnConnect: boolean;
  getLightweight: () => boolean;
}

/**
 * Run phases 8–10 of activation: status bars, command registration, and
 * event wiring. Returns the number of phases run and succeeded so the
 * caller can include them in the activation summary.
 */
export function setupFinalPhases(
  d: FinalPhaseDeps,
  track: <T>(r: T | undefined) => T | undefined,
): void {
  // Phase 8: Status bars + UI wiring.
  let dashboardPromptShown = false;
  const statusBars = track(runPhase('status-bars', d.channel, () => {
    const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    const refreshStatusBar = (): void =>
      updateStatusBar(statusItem, d.discovery, d.serverManager, d.discoveryEnabled, d.cachedClient);
    refreshStatusBar();
    d.context.subscriptions.push(statusItem);

    const healthStatusBar = new HealthStatusBar();
    d.context.subscriptions.push(healthStatusBar);

    const toolsQuickPick = new ToolsQuickPickStatusBar();
    d.context.subscriptions.push(toolsQuickPick);
    registerToolsQuickPickCommand(d.context);

    return { statusItem, healthStatusBar, toolsQuickPick, refreshStatusBar };
  }));

  // Connection UI refresh callback — needs providers and schemaCache.
  const connectionUiRefresh: { fn?: () => void } = {};
  if (d.providers) {
    const providers = d.providers;
    connectionUiRefresh.fn = () => {
      syncDriftConnectionUi(d.serverManager, d.cachedClient, {
        toolsProvider: providers.toolsProvider,
        treeProvider: providers.treeProvider,
        schemaCache: d.schemaCache,
      }, {
        appendLine: (msg: string) => {
          if (shouldLogConnectionLine(msg, getLogVerbosity())) {
            d.channel.appendLine(msg);
          }
        },
      });
      providers.treeProvider.notifyConnectionPresentationChanged();
    };
    d.providers.treeProvider.postRefreshHook = () => connectionUiRefresh.fn?.();
    d.context.subscriptions.push(
      d.schemaCache.onDidUpdate(() => {
        void providers.treeProvider.refresh();
      }),
    );
  }

  // Phase 9: Command registration.
  track(runPhase('commands', d.channel, () => {
    if (d.providers && d.editing) {
      registerAllCommands(d.context, d.cachedClient, {
        ...d.providers,
        ...d.editing,
        annotationStore: d.annotationStore,
        statusItem: statusBars?.statusItem ?? vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100),
        discovery: d.discovery,
        serverManager: d.serverManager,
        discoveryEnabled: d.discoveryEnabled,
        watcher: d.watcher,
        schemaTracker: d.schemaTracker ?? new SchemaTracker(d.cachedClient, d.context.workspaceState, d.watcher),
        updateStatusBar: statusBars?.refreshStatusBar ?? (() => {}),
        connectionChannel: d.channel,
        healthStatusBar: statusBars?.healthStatusBar ?? new HealthStatusBar(),
        refreshDriftConnectionUi: () => connectionUiRefresh.fn?.(),
      });
    } else if (d.providers) {
      d.channel.appendLine(`[${ts()}] Registering commands without editing (editing phase failed).`);
    } else {
      d.channel.appendLine(`[${ts()}] Skipping command registration: providers phase failed.`);
    }
  }));

  // Initial connection UI sync + VM transport listener.
  connectionUiRefresh.fn?.();
  d.context.subscriptions.push(
    d.cachedClient.onVmTransportChanged(() => connectionUiRefresh.fn?.()),
  );

  // Phase 10: Event listeners + initial state.
  track(runPhase('event-wiring', d.channel, () => {
    // Master enable/disable switch.
    const applyEnabledState = (enabled: boolean): void => {
      void vscode.commands.executeCommand('setContext', 'driftViewer.enabled', enabled);
      if (enabled) {
        if (d.discoveryEnabled) d.discovery.start();
        d.watcher.start();
        if (d.providers) {
          if (d.loadOnConnect) void d.providers.treeProvider.refresh();
          d.providers.codeLensProvider.refreshRowCounts();
          d.providers.linter.refresh();
        }
        d.diagnostics?.diagnosticManager.refresh().catch(() => {});
        if (d.providers && !d.getLightweight()) d.providers.refreshBadges().catch(() => {});
        connectionUiRefresh.fn?.();
      } else {
        d.discovery.stop();
        d.watcher.stop();
        d.serverManager.clearActive();
        d.schemaCache.invalidate();
        statusBars?.healthStatusBar.hide();
        statusBars?.toolsQuickPick.hide();
        connectionUiRefresh.fn?.();
      }
      statusBars?.refreshStatusBar();
    };

    d.context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('driftViewer.enabled')) {
          const enabled = vscode.workspace.getConfiguration('driftViewer').get<boolean>('enabled', true) !== false;
          applyEnabledState(enabled);
        }
      }),
    );

    // Server connection lifecycle.
    let treeLoadedLazy = false;
    d.serverManager.onDidChangeActive((server) => {
      statusBars?.refreshStatusBar();
      d.schemaCache.invalidate();
      connectionUiRefresh.fn?.();
      if (isDriftUiConnected(d.serverManager, d.cachedClient)) {
        statusBars?.toolsQuickPick.show();
      } else {
        statusBars?.toolsQuickPick.hide();
      }
      if (!server) {
        statusBars?.healthStatusBar.hide();
        treeLoadedLazy = false;
      }
      if (server) {
        d.watcher.stop();
        d.watcher.reset();
        d.watcher.start();
        d.schemaCache.prewarm();
        if (d.providers) {
          if (d.loadOnConnect) void d.providers.treeProvider.refresh();
          d.providers.codeLensProvider.refreshRowCounts();
          d.providers.linter.refresh();
        }
        d.diagnostics?.diagnosticManager.refresh().catch(() => {});
        if (d.providers && !d.getLightweight()) d.providers.refreshBadges().catch(() => {});
        if (d.providers) d.providers.watchManager.refresh().catch(() => {});
        if (!dashboardPromptShown) {
          dashboardPromptShown = true;
          const showOnConnect = vscode.workspace
            .getConfiguration('driftViewer')
            .get<boolean>('dashboard.showOnConnect', true);
          const suppressKey = 'driftViewer.suppressDashboardPrompt';
          const suppressed = d.context.workspaceState.get<boolean>(suppressKey, false);
          if (showOnConnect && !suppressed) {
            void vscode.window.showInformationMessage(
              'Drift server connected! Open the Dashboard to explore all features.',
              'Open Dashboard',
              "Don't Show Again",
            ).then((choice) => {
              if (choice === 'Open Dashboard') {
                vscode.commands.executeCommand('driftViewer.openDashboard');
              } else if (choice === "Don't Show Again") {
                d.context.workspaceState.update(suppressKey, true);
              }
            });
          }
        }
      }
    });

    // Delayed context sync to handle races where the sidebar evaluates
    // before the extension finishes wiring.
    const syncContextTimeout = setTimeout(() => connectionUiRefresh.fn?.(), 1500);
    d.context.subscriptions.push({ dispose: () => clearTimeout(syncContextTimeout) });

    // Discovery server list changes.
    d.discovery.onDidChangeServers(() => {
      statusBars?.refreshStatusBar();
      connectionUiRefresh.fn?.();
    });

    // Lazy tree loading when the tree view becomes visible.
    if (d.providers && typeof d.providers.treeView.onDidChangeVisibility === 'function') {
      d.context.subscriptions.push(
        d.providers.treeView.onDidChangeVisibility((e: { visible: boolean }) => {
          if (e.visible && !d.loadOnConnect && !treeLoadedLazy && isDriftUiConnected(d.serverManager, d.cachedClient)) {
            treeLoadedLazy = true;
            void d.providers!.treeProvider.refresh();
          }
        }),
      );
    }

    // Schema generation watcher — refreshes tree, caches, linters, etc.
    d.watcher.onDidChange(async () => {
      d.schemaCache.invalidate();
      if (!d.getLightweight() && d.providers) {
        void d.providers.treeProvider.refresh();
        d.providers.definitionProvider.clearCache();
        d.providers.hoverCache.clear();
        await d.providers.codeLensProvider.refreshRowCounts();
        d.providers.codeLensProvider.notifyChange();
        d.providers.linter.refresh();
        d.diagnostics?.diagnosticManager.refresh().catch(() => {});
        d.providers.refreshBadges().catch(() => {});
        if (vscode.workspace.getConfiguration('driftViewer').get<boolean>('timeline.autoCapture', true)) {
          d.providers.snapshotStore.capture(d.cachedClient).catch(() => {});
        }
        d.providers.watchManager.refresh().catch(() => {});
        if (DashboardPanel.currentPanel) {
          DashboardPanel.currentPanel.refreshAll().catch(() => {});
        }
      }
      if (d.providers) {
        d.providers.dbpProvider.onGenerationChange().catch(() => {});
      }
    });

    // Start watcher + initial refresh if extension is enabled.
    if (d.extensionEnabled) {
      d.watcher.start();
      if (d.providers) {
        if (d.loadOnConnect) {
          void d.providers.treeProvider.refresh();
        }
        d.providers.codeLensProvider.refreshRowCounts();
        d.providers.linter.refresh();
      }
      if (isDriftUiConnected(d.serverManager, d.cachedClient)) {
        d.schemaCache.prewarm();
      }
      d.diagnostics?.diagnosticManager.refresh().catch(() => {});
      if (d.providers && !d.getLightweight()) d.providers.refreshBadges().catch(() => {});
    }
    d.context.subscriptions.push({ dispose: () => d.watcher.stop() });
  }));
}
