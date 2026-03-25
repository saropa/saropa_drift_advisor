/**
 * Debug command registration: delegates to perf, panels, and VM lifecycle modules.
 */

import * as vscode from 'vscode';
import type { IDebugCommandDeps } from './debug-commands-types';
import { PerfBaselineStore } from './perf-baseline-store';
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

  const { perfProvider, revealTable } = registerDebugCommandsPerf(context, deps);

  // The Schema Search webview provider is created and registered in
  // setupProviders so it's available before registerAllCommands runs.
  // Here we wire the revealTable callback and register remaining panel
  // commands (docs, global search).
  registerDebugCommandsPanels(
    context, deps.client, revealTable, deps,
    deps.schemaSearchProvider!, deps.schemaSearchRevealRef!,
  );

  const baselineStore = new PerfBaselineStore(context.workspaceState);

  const refreshInterval = vscode.workspace.getConfiguration('driftViewer')
    .get<number>('performance.refreshIntervalMs', 3000) ?? 3000;

  registerDebugCommandsVm(context, deps, {
    perfProvider,
    baselineStore,
    refreshInterval,
    logConnection,
  });

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.resetPerfBaseline',
      async () => {
        const items = Array.from(baselineStore.baselines.values()).map((b) => ({
          label: b.normalizedSql,
          description: `avg ${Math.round(b.avgDurationMs)}ms (${b.sampleCount} samples)`,
        }));
        if (items.length === 0) {
          vscode.window.showInformationMessage('No performance baselines stored.');
          return;
        }
        const pick = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a query baseline to reset',
        });
        if (pick) {
          baselineStore.resetOne(pick.label);
          vscode.window.showInformationMessage(`Baseline reset for: ${pick.label}`);
        }
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
