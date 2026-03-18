/**
 * Registers the "Troubleshooting" command.
 * Opens a rich webview panel with connection guidance, setup checklist,
 * architecture diagrams, and quick-action buttons.
 */

import * as vscode from 'vscode';
import { TroubleshootingPanel } from './troubleshooting-panel';

export function registerTroubleshootingCommands(
  context: vscode.ExtensionContext,
  connectionChannel: vscode.OutputChannel,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.showTroubleshooting', () => {
      connectionChannel.appendLine(
        `[${new Date().toISOString()}] Troubleshooting: opened panel (user triggered)`,
      );
      try {
        const cfg = vscode.workspace.getConfiguration('driftViewer');
        const port = cfg.get<number>('port', 8642) ?? 8642;
        TroubleshootingPanel.createOrShow(port);
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
