/**
 * Phase 10 of activation: the event listeners that keep UI, caches, diagnostics,
 * and the schema watcher in sync with enable/disable, server connect/disconnect,
 * discovery changes, tree visibility, and schema-generation bumps. Extracted from
 * extension-activation-final.ts so that file stays under the line cap; the status
 * bars and connection-UI refresh hook are passed in from there.
 */
import * as vscode from 'vscode';
import { isDriftUiConnected } from './connection-ui-state';
import { DashboardPanel } from './dashboard/dashboard-panel';
import { workspaceUsesDrift } from './diagnostics/dart-file-parser';
import type { HealthStatusBar } from './status-bar-health';
import type { ToolsQuickPickStatusBar } from './status-bar-tools';
import type { FinalPhaseDeps } from './extension-activation-final';

/** Status-bar handles created in Phase 8 and consumed by the event listeners. */
export interface IFinalStatusBars {
  statusItem: vscode.StatusBarItem;
  healthStatusBar: HealthStatusBar;
  toolsQuickPick: ToolsQuickPickStatusBar;
  refreshStatusBar: () => void;
}

/**
 * Wire all Phase 10 event listeners. [connectionUiRefresh] is a holder so this
 * closure picks up the refresh callback assigned during command registration.
 */
export function wireEventListeners(
  d: FinalPhaseDeps,
  statusBars: IFinalStatusBars | undefined,
  connectionUiRefresh: { fn?: () => void },
): void {
  // Gate the "open Dashboard" prompt to once per session.
  let dashboardPromptShown = false;

  // Master enable/disable switch.
  const applyEnabledState = (enabled: boolean): void => {
    void vscode.commands.executeCommand('setContext', 'driftViewer.enabled', enabled);
    if (enabled) {
      if (d.discoveryEnabled) {
        void workspaceUsesDrift().then((isDrift) => {
          if (isDrift) d.discovery.start();
        });
      }
      d.watcher.start();
      if (d.providers) {
        if (d.loadOnConnect) void d.providers.treeProvider.refresh();
        d.providers.codeLensProvider.refreshRowCounts();
      }
      // DiagnosticManager is the single source of diagnostics; the
      // legacy `SchemaDiagnostics` refresh that used to live here
      // has been retired (it was duplicating anomaly + index-
      // suggestion emissions into a second collection).
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
    // Drop the SchemaIntelligence cache on a real generation change so schema
    // insights (and the diagnostics built from them, refreshed below) reflect
    // the new schema instead of serving stale data until the TTL lapses. This
    // call was previously never made. See plans/full-codebase-audit-2026.06.12.md M12.
    d.intel?.schemaIntel.checkGeneration().catch(() => {});
    if (!d.getLightweight() && d.providers) {
      void d.providers.treeProvider.refresh();
      d.providers.definitionProvider.clearCache();
      d.providers.hoverCache.clear();
      await d.providers.codeLensProvider.refreshRowCounts();
      d.providers.codeLensProvider.notifyChange();
      d.diagnostics?.diagnosticManager.refresh().catch(() => {});
      d.providers.refreshBadges().catch(() => {});
      if (vscode.workspace.getConfiguration('driftViewer').get<boolean>('timeline.autoCapture', true)) {
        // Trailing-edge debounce: a write burst coalesces into one re-dump
        // after a quiet period instead of one full physical-table re-scan per
        // generation bump (see SnapshotStore.requestCapture).
        d.providers.snapshotStore.requestCapture(d.cachedClient);
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
    }
    if (isDriftUiConnected(d.serverManager, d.cachedClient)) {
      d.schemaCache.prewarm();
    }
    d.diagnostics?.diagnosticManager.refresh().catch(() => {});
    if (d.providers && !d.getLightweight()) d.providers.refreshBadges().catch(() => {});
  }
  d.context.subscriptions.push({ dispose: () => d.watcher.stop() });
}
