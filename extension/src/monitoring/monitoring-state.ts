/**
 * Read-side of the global monitoring & logging kill switch — a leaf module
 * with no imports beyond vscode, so every consumer (tree provider, hub
 * panel, diagnostics, badges, the wiring module itself) can read the state
 * without creating import cycles. The write-side (commands, config listener,
 * server push) lives in monitoring-kill-switch.ts.
 */
import * as vscode from 'vscode';

/** Setting name under the `driftViewer.` namespace. */
export const MONITORING_CONFIG_KEY = 'enableMonitoringAndLogging';

/**
 * Effective kill-switch state. `true` = monitoring active (the default).
 * The code-side fallback MUST match the package.json default (true).
 */
export function isMonitoringEnabled(): boolean {
  return (
    vscode.workspace
      .getConfiguration('driftViewer')
      .get<boolean>(MONITORING_CONFIG_KEY, true) !== false
  );
}

/** Convenience inverse for guards that read as "is the switch engaged". */
export function isMonitoringKilled(): boolean {
  return !isMonitoringEnabled();
}
