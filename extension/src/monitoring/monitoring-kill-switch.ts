/**
 * Global monitoring & logging kill switch (extension side).
 *
 * One setting — `driftViewer.enableMonitoringAndLogging` — governs every
 * monitoring surface: diagnostics (DiagnosticManager self-gates), file
 * badges (refreshBadges self-gates), the Database tree (provider renders a
 * blank-state banner), and the Dart debug server (told over POST
 * /api/monitoring to halt query recording, timing capture, and sweeps; its
 * data endpoints then answer 403 until resumed).
 *
 * Reactive like `driftViewer.enabled` (config listener + apply function),
 * NOT lazily-polled like `driftViewer.lightweight` — a kill switch must take
 * effect the moment it is flipped, mid-session, without a reload.
 */
import * as vscode from 'vscode';
import { t } from '../l10n';
import { DriftToolsHubPanel } from '../hub/hub-panel';
import {
  MONITORING_CONFIG_KEY,
  isMonitoringEnabled,
  isMonitoringKilled,
} from './monitoring-state';
import type { FinalPhaseDeps } from '../extension-activation-final';
import type { IFinalStatusBars } from '../extension-activation-event-wiring';

// Re-export the read-side so wiring call sites need one import path.
export { MONITORING_CONFIG_KEY, isMonitoringEnabled, isMonitoringKilled };

/** Context key driving the sidebar power button's kill/resume swap. */
const MONITORING_CONTEXT_KEY = 'driftViewer.monitoringEnabled';

/**
 * Wire the kill switch: the two explicit commands, the reactive config
 * listener, the on-connect server push, and the initial context key.
 * Called from Phase 10 event wiring, which owns the same deps bag.
 */
export function wireMonitoringKillSwitch(
  d: FinalPhaseDeps,
  statusBars: IFinalStatusBars | undefined,
  connectionUiRefresh: { fn?: () => void },
): void {
  /**
   * Push the state to the connected Dart server. Best-effort: an unreachable
   * server is not an error (there may be none), but a live server that
   * REFUSES the flip is surfaced — a kill the user believes happened must
   * not silently keep recording on the server side.
   */
  const pushToServer = async (enabled: boolean): Promise<void> => {
    // Skip when no server is active — nothing to instruct.
    if (!d.serverManager.activeServer) return;
    try {
      await d.cachedClient.setMonitoring(enabled);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      void vscode.window.showWarningMessage(
        t('host.monitoring.serverSyncFailed', msg),
      );
    }
  };

  /** Re-render every surface the switch owns for the new state. */
  const apply = (enabled: boolean, notify: boolean): void => {
    void vscode.commands.executeCommand(
      'setContext',
      MONITORING_CONTEXT_KEY,
      enabled,
    );

    // Server first, so recording stops (or resumes) before the UI repaints.
    void pushToServer(enabled);

    if (enabled) {
      // Resume: refetch the tree, re-arm diagnostics and badges. No window
      // reload required — the plan's failsafe re-enabling criterion.
      if (d.providers) {
        void d.providers.treeProvider.refresh();
        d.providers.refreshBadges().catch(() => {});
      }
      d.diagnostics?.diagnosticManager.refresh().catch(() => {});
    } else {
      // Kill: purge Problems-panel squiggles and badges immediately and
      // blank the tree. Each callee is also self-gated, so a queued sweep
      // that lands later cannot repopulate what was just cleared.
      d.diagnostics?.diagnosticManager.clear();
      if (d.providers) {
        d.providers.fileDecoProvider.clearAll();
        void d.providers.treeProvider.refresh();
      }
    }

    statusBars?.refreshStatusBar();
    connectionUiRefresh.fn?.();
    DriftToolsHubPanel.refreshIfOpen();

    if (notify) {
      if (enabled) {
        void vscode.window.showInformationMessage(
          t('host.monitoring.resumedToast'),
        );
      } else {
        // Offer the way back in the same toast — the killed state hides
        // most UI, so the resume path must be one tap away.
        void vscode.window
          .showWarningMessage(
            t('host.monitoring.killedToast'),
            t('host.monitoring.resumeAction'),
          )
          .then((choice) => {
            if (choice === t('host.monitoring.resumeAction')) {
              void vscode.commands.executeCommand(
                'driftViewer.monitoring.resume',
              );
            }
          });
      }
    }
  };

  /**
   * Both commands write the SETTING; the config listener below does the
   * applying. Single flow whether the flip comes from the command palette,
   * the sidebar button, the hub card, or a hand edit of settings.json.
   * Workspace target when a workspace is open (the setting is a per-project
   * choice), global otherwise so the commands still work in empty windows.
   */
  const updateSetting = (enabled: boolean): void => {
    const target = vscode.workspace.workspaceFolders?.length
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
    void vscode.workspace
      .getConfiguration('driftViewer')
      .update(MONITORING_CONFIG_KEY, enabled, target);
  };

  d.context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.monitoring.kill', () =>
      updateSetting(false),
    ),
    vscode.commands.registerCommand('driftViewer.monitoring.resume', () =>
      updateSetting(true),
    ),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(`driftViewer.${MONITORING_CONFIG_KEY}`)) {
        apply(isMonitoringEnabled(), true);
      }
    }),
    // On every connect, push the current state so a freshly discovered
    // server honors an already-engaged kill switch. Only the kill is pushed
    // proactively: force-enabling on connect could override a host app that
    // deliberately started dormant (monitoringEnabled: false in Dart).
    d.serverManager.onDidChangeActive((server) => {
      if (server && isMonitoringKilled()) {
        void pushToServer(false);
      }
    }),
  );

  // Seed the context key (and blank surfaces if the session starts killed) —
  // without a toast: activation must not open with a warning for a state the
  // user chose in a previous session.
  apply(isMonitoringEnabled(), false);
}
