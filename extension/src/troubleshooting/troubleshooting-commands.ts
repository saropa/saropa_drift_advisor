/**
 * Registers the "Troubleshooting" command.
 * Opens a rich webview panel with connection guidance, setup checklist,
 * architecture diagrams, and quick-action buttons.
 */

import * as vscode from 'vscode';
import { TroubleshootingPanel } from './troubleshooting-panel';
import { gatherConnectionDiagnostics } from './connection-diagnostics';

export function registerTroubleshootingCommands(
  context: vscode.ExtensionContext,
  connectionChannel: vscode.OutputChannel,
): void {
  context.subscriptions.push(
    // [stateHint] is supplied by the Database tree's status row ('offline' /
    // 'disconnected') so the panel can render the precise state; it is undefined
    // when opened from the Tools list, which resolves to the 'unknown' header.
    vscode.commands.registerCommand('driftViewer.showTroubleshooting', (stateHint?: unknown) => {
      connectionChannel.appendLine(
        `[${new Date().toISOString()}] Troubleshooting: opened panel (user triggered)`,
      );
      try {
        const diag = gatherConnectionDiagnostics(stateHint);
        TroubleshootingPanel.createOrShow(diag);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        connectionChannel.appendLine(
          `[${new Date().toISOString()}] Troubleshooting: failed — ${msg}`,
        );
        void vscode.window.showErrorMessage(
          `Failed to open Troubleshooting panel: ${msg}`,
        );
      }
    }),
  );
}
