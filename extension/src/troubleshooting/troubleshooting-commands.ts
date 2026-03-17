/**
 * Registers the "Troubleshooting" command.
 * Opens a rich webview panel with connection guidance, setup checklist,
 * architecture diagrams, and quick-action buttons.
 */

import * as vscode from 'vscode';
import { TroubleshootingPanel } from './troubleshooting-panel';

export function registerTroubleshootingCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.showTroubleshooting', () => {
      // Read the configured port so the panel can show accurate help text
      const cfg = vscode.workspace.getConfiguration('driftViewer');
      const port = cfg.get<number>('port', 8642) ?? 8642;
      TroubleshootingPanel.createOrShow(port);
    }),
  );
}
