/**
 * Debug command registration: delegates to perf, panels, and VM lifecycle modules.
 */

import * as vscode from 'vscode';
import type { IDebugCommandDeps } from './debug-commands-types';
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
  registerDebugCommandsPanels(context, deps.client, revealTable);

  const refreshInterval = vscode.workspace.getConfiguration('driftViewer')
    .get<number>('performance.refreshIntervalMs', 3000) ?? 3000;

  registerDebugCommandsVm(context, deps, {
    perfProvider,
    refreshInterval,
    logConnection,
  });
}
