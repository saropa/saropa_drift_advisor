/**
 * Debug command registration: delegates to perf, panels, and VM lifecycle modules.
 */

import * as vscode from 'vscode';
import type { IDebugCommandDeps } from './debug-commands-types';
import { PerfBaselineStore } from './perf-baseline-store';
import { PerfBaselinePanel } from './perf-baseline-panel';
import { registerDebugCommandsPanels } from './debug-commands-panels';
import { registerDebugCommandsPerf } from './debug-commands-perf';
import { registerDebugCommandsVm } from './debug-commands-vm';
export type { IConnectionLog, IDebugCommandDeps } from './debug-commands-types';

/** Register debug panel, profiler, docs, global search, and VM Service lifecycle. */
export function registerDebugCommands(
  context: vscode.ExtensionContext,
  deps: IDebugCommandDeps,
): void {
  const { connectionLog } = deps;

  const logConnection = (msg: string): void => {
    connectionLog?.appendLine(`[${new Date().toISOString()}] ${msg}`);
  };

  const { perfProvider } = registerDebugCommandsPerf(context, deps);

  // Register docs, global search, and Dart schema scan commands.
  registerDebugCommandsPanels(context, deps.client);

  const baselineStore = new PerfBaselineStore(context.workspaceState);

  const refreshInterval = vscode.workspace.getConfiguration('driftViewer')
    .get<number>('performance.refreshIntervalMs', 3000) ?? 3000;

  registerDebugCommandsVm(context, deps, {
    perfProvider,
    baselineStore,
    refreshInterval,
    logConnection,
  });

  // Open the performance baselines webview panel for viewing and resetting
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.resetPerfBaseline',
      () => {
        if (baselineStore.size === 0) {
          vscode.window.showInformationMessage('No performance baselines stored.');
          return;
        }
        PerfBaselinePanel.createOrShow(baselineStore);
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.resetAllPerfBaselines',
      async () => {
        if (baselineStore.size === 0) {
          vscode.window.showInformationMessage('No performance baselines stored.');
          return;
        }
        const confirm = await vscode.window.showWarningMessage(
          `Reset all ${baselineStore.size} performance baselines?`,
          { modal: true },
          'Reset All',
        );
        if (confirm === 'Reset All') {
          baselineStore.resetAll();
          vscode.window.showInformationMessage('All performance baselines reset.');
        }
      },
    ),
  );

}
