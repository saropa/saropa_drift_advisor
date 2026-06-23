import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { IHealthScorerProvider } from '../dashboard/dashboard-types';
import { DriftToolsHubPanel } from './hub-panel';

/**
 * Register the Saropa Drift Tools Hub command. The hub composes read-only
 * Dashboard + Health Score snapshots and surfaces every other webview tool as a
 * launcher; it reuses the same `HealthScorer` provider the Dashboard widgets do.
 */
export function registerHubCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
  healthScorer: IHealthScorerProvider,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.openDriftToolsHub', () => {
      DriftToolsHubPanel.createOrShow(client, healthScorer, context.workspaceState);
    }),
  );
}
