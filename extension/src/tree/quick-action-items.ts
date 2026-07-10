/**
 * Tree items for connection-state action rows in the Database Explorer:
 * [getDisconnectedActions] for the fully-disconnected state and
 * [getSchemaRestFailureActions] for the connected-but-REST-failed state.
 * These expose the same commands as the Database `viewsWelcome` overlay
 * as real tree rows (reliable in all VS Code forks).
 */

import * as vscode from 'vscode';
import { t } from '../l10n';

// ── Node types ────────────────────────────────────────────────────────

/** An individual clickable action that runs a command. */
export class ActionItem extends vscode.TreeItem {
  constructor(label: string, commandId: string, icon: string, tooltip?: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(icon);
    this.command = { command: commandId, title: label };
    this.contextValue = 'quickAction';
    if (tooltip) {
      this.tooltip = tooltip;
    }
  }
}

/**
 * Clickable tree rows for the "not connected" state.
 * Mirrors package.json `viewsWelcome` for the disconnected scenario so actions work when
 * markdown `command:` links in the welcome overlay do not fire (observed in some VS Code
 * forks/versions). Includes discovery retry, diagnostics, and server selection.
 */
export function getDisconnectedActions(): ActionItem[] {
  return [
    new ActionItem('Retry Discovery', 'driftViewer.retryDiscovery', 'refresh',
      'Reset discovery and scan for Drift debug servers again'),
    new ActionItem('Diagnose connection', 'driftViewer.diagnoseConnection', 'pulse',
      'Write connection details to Output and optionally copy a summary'),
    new ActionItem('Troubleshooting', 'driftViewer.showTroubleshooting', 'tools',
      'Open the troubleshooting panel'),
    new ActionItem('Connection log', 'driftViewer.showConnectionLog', 'output',
      'Show Saropa Drift Advisor output'),
    new ActionItem('Select Server', 'driftViewer.selectServer', 'plug',
      'Pick the Drift debug server to use'),
    new ActionItem('Forward Port (Android)', 'driftViewer.forwardPortAndroid', 'device-mobile',
      'Forward port from Android emulator'),
    new ActionItem('Open in Browser', 'driftViewer.openInBrowser', 'globe',
      'Open the Drift viewer in an external browser'),
    new ActionItem('Refresh sidebar UI', 'driftViewer.refreshConnectionUi', 'layout',
      'Refresh the connection status display'),
  ];
}

/**
 * Blank-state banner shown as the ONLY tree row while the global monitoring
 * kill switch is engaged. A real TreeItem (not viewsWelcome markdown) for the
 * same fork-reliability reason as the other banners; localized via `t()`.
 */
export class MonitoringKilledBannerItem extends vscode.TreeItem {
  constructor() {
    super(t('host.monitoring.treeBanner'), vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(
      'circle-slash',
      new vscode.ThemeColor('problemsWarningIcon.foreground'),
    );
    this.contextValue = 'monitoringKilledBanner';
    this.tooltip = t('host.monitoring.treeBannerTooltip');
  }
}

/**
 * The single action row under the kill-switch banner: one tap back to a live
 * tree. Kept to one action on purpose — a killed sidebar should read as
 * intentionally dormant, not as a broken connection needing triage.
 */
export function getMonitoringKilledActions(): ActionItem[] {
  return [
    new ActionItem(
      t('host.monitoring.treeResumeAction'),
      'driftViewer.monitoring.resume',
      'debug-start',
      t('host.monitoring.treeResumeTooltip'),
    ),
  ];
}

/**
 * Clickable tree rows for the "connected but REST schema failed" state.
 * Mirrors package.json `viewsWelcome` for that scenario so actions work when markdown
 * `command:` links in the welcome overlay do not (some VS Code forks).
 */
export function getSchemaRestFailureActions(): ActionItem[] {
  return [
    new ActionItem('Refresh tree', 'driftViewer.refreshTree', 'refresh',
      'Retry loading schema from the Drift REST API'),
    new ActionItem('Diagnose connection', 'driftViewer.diagnoseConnection', 'pulse',
      'Write connection details to Output and optionally copy a summary'),
    new ActionItem('Troubleshooting', 'driftViewer.showTroubleshooting', 'tools',
      'Open the troubleshooting panel'),
    new ActionItem('Connection log', 'driftViewer.showConnectionLog', 'output',
      'Show Saropa Drift Advisor output'),
    new ActionItem('Open in Browser', 'driftViewer.openInBrowser', 'globe',
      'Open the Drift viewer in an external browser'),
    new ActionItem('Select Server', 'driftViewer.selectServer', 'plug',
      'Pick the Drift debug server to use'),
    new ActionItem('Connection help (web)', 'driftViewer.openConnectionHelp', 'book',
      'Open connection documentation in the browser'),
  ];
}
