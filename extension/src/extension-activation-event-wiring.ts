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
import { isBlobColumn } from './sql/blob-safe-select';
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

  // Gate the auto-capture recommendation to one schema scan per session; the
  // persistent workspaceState key below stops it ever re-appearing once offered.
  let autoCaptureRecommendChecked = false;

  // Persistent workspaceState key for the auto-capture recommendation. Once the
  // prompt has been shown in a workspace it is never shown again there, whatever
  // the user chose — the recommendation is informational, not a nag.
  const AUTO_CAPTURE_RECOMMEND_KEY = 'driftViewer.autoCaptureRecommendShown';

  // Offer to turn ON timeline auto-capture, but ONLY when it is currently off AND
  // the connected schema declares no BLOB columns. Auto-capture re-dumps every
  // table with SELECT *; on a schema with image/attachment BLOB tables that can
  // OOM-crash the connected app (BUG_TIMELINE_CAPTURE_SELECT_STAR_BLOB_OOM.md),
  // which is why it ships off by default. When the schema has no BLOB columns that
  // failure mode is absent, so enabling auto-capture is safe and worth suggesting.
  const maybeRecommendAutoCapture = (client: typeof d.cachedClient): void => {
    if (autoCaptureRecommendChecked) return;
    autoCaptureRecommendChecked = true;

    const cfg = vscode.workspace.getConfiguration('driftViewer');
    // Already on, or already offered in this workspace — nothing to suggest.
    if (cfg.get<boolean>('timeline.autoCapture', false)) return;
    if (d.context.workspaceState.get<boolean>(AUTO_CAPTURE_RECOMMEND_KEY, false)) return;

    // Metadata-only read (no row/BLOB payloads); the schema cache is prewarmed on
    // connect, so this is cheap and does not pile onto the app's startup burst.
    void client
      .schemaMetadata()
      .then((metadata) => {
        // Recommend only for a non-empty schema that is entirely BLOB-free; an
        // empty metadata result means we could not read the schema, so stay silent.
        const hasTables = metadata.length > 0;
        const hasBlob = metadata.some((t) => t.columns.some((c) => isBlobColumn(c.type)));
        if (!hasTables || hasBlob) return;

        // Mark shown before awaiting the choice so a fast reconnect cannot race a
        // second prompt into existence.
        void d.context.workspaceState.update(AUTO_CAPTURE_RECOMMEND_KEY, true);
        void vscode.window
          .showInformationMessage(
            'This database has no large-BLOB tables, so timeline auto-capture is safe here. Enable it to snapshot the database on every data change?',
            'Enable',
            'Not now',
          )
          .then((choice) => {
            if (choice === 'Enable') {
              // Scope to the workspace: "no BLOB tables" was verified for THIS
              // schema, so the safety guarantee is workspace-specific, not global.
              void vscode.workspace
                .getConfiguration('driftViewer')
                .update('timeline.autoCapture', true, vscode.ConfigurationTarget.Workspace);
            }
          });
      })
      .catch(() => {
        // Schema unreadable (server dropped, auth, etc.) — allow a later
        // reconnect this session to retry the check rather than silently burning it.
        autoCaptureRecommendChecked = false;
      });
  };

  // Heavy DB sweeps — null-rate scans (DataQualityProvider), per-table row
  // counts, and the LIMIT-1000 timeline auto-capture — all run over the app's
  // single live Drift connection. Firing them the instant the app connects
  // stacks them onto the app's own startup query burst; serialized on one
  // connection, every query inflates into the 800ms-1.5s range and stalls the
  // main isolate long enough to skip hundreds of frames and freeze a real app's
  // launch (see plans/history/2026.06/2026.06.17/BUG_STARTUP_HANG.md). Hold the
  // heavy sweep off until the
  // app's startup burst has had a quiet window to drain; cheap schema/UI
  // refreshes (tree, badges, caches) still run immediately on connect.
  const STARTUP_SWEEP_GRACE_MS = 6000;
  let startupGraceUntil = 0;
  let deferredSweepTimer: ReturnType<typeof setTimeout> | undefined;

  const runHeavySweep = (): void => {
    d.diagnostics?.diagnosticManager.refresh().catch(() => {});
    if (d.providers) {
      void d.providers.codeLensProvider.refreshRowCounts();
      // Timeline auto-capture re-dumps every physical table (SELECT * LIMIT N);
      // gated on the same config as the watcher path. OFF by default: the sweep's
      // SELECT * can materialize BLOB-bearing rows in the connected app and OOM-crash
      // it (plans/history/2026.06/2026.06.28/BUG_TIMELINE_CAPTURE_SELECT_STAR_BLOB_OOM.md), so the fallback when
      // the key is absent must match package.json's `false` default — never re-enable
      // here. requestCapture carries its own trailing-edge debounce.
      if (
        vscode.workspace
          .getConfiguration('driftViewer')
          .get<boolean>('timeline.autoCapture', false)
      ) {
        d.providers.snapshotStore.requestCapture(d.cachedClient);
      }
    }
  };

  // Run the heavy sweep after [delayMs]. A single shared timer dedupes the two
  // connect-time requesters — the connect handler and the watcher's initial
  // post-connect poll both ask for the sweep, and only the last schedule wins.
  const scheduleHeavySweep = (delayMs: number): void => {
    if (deferredSweepTimer) clearTimeout(deferredSweepTimer);
    deferredSweepTimer = setTimeout(() => {
      deferredSweepTimer = undefined;
      runHeavySweep();
    }, delayMs);
  };
  d.context.subscriptions.push({
    dispose: () => {
      if (deferredSweepTimer) clearTimeout(deferredSweepTimer);
    },
  });

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
      }
      // Defer the heavy DB sweep (row counts + null-rate scans + timeline
      // capture) past the app's startup query burst — running it now contends
      // on the single live connection and freezes launch (BUG_STARTUP_HANG).
      // The watcher's initial post-connect poll also requests the sweep; the
      // shared timer in scheduleHeavySweep dedupes the two into one run.
      startupGraceUntil = Date.now() + STARTUP_SWEEP_GRACE_MS;
      scheduleHeavySweep(STARTUP_SWEEP_GRACE_MS);
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
      // Offer to enable timeline auto-capture when this schema has no BLOB tables
      // (the OOM precondition that keeps auto-capture off by default). One-time per
      // workspace; reads metadata only.
      if (d.cachedClient) maybeRecommendAutoCapture(d.cachedClient);
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
  d.watcher.onDidChange(() => {
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
      d.providers.codeLensProvider.notifyChange();
      d.providers.refreshBadges().catch(() => {});
      d.providers.watchManager.refresh().catch(() => {});
      // Heavy DB sweep (row counts, null-rate scans, timeline auto-capture).
      // During the post-connect startup grace window defer it so it doesn't
      // pile onto the app's launch query burst (the watcher's initial poll
      // fires right after connect); a genuine later schema regeneration runs it
      // promptly. See plans/history/2026.06/2026.06.17/BUG_STARTUP_HANG.md.
      // requestCapture and the
      // diagnostic refresh keep their own debounce inside runHeavySweep.
      const graceRemaining = startupGraceUntil - Date.now();
      if (graceRemaining > 0) {
        scheduleHeavySweep(graceRemaining);
      } else {
        runHeavySweep();
      }
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
