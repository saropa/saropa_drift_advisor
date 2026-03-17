/**
 * Command registration for the database polling toggle.
 * Registers driftViewer.togglePolling which reads current state from the
 * server, flips it, and shows an info message with the new state.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { ToolsTreeProvider } from '../tree/tools-tree-provider';

/** Register the toggle polling command. */
export function registerPollingCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
  toolsProvider: ToolsTreeProvider,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.togglePolling',
      async () => {
        try {
          // Read current state from the server, then toggle it.
          const current = await client.getChangeDetection();
          const newState = await client.setChangeDetection(!current);

          // Show user-friendly feedback about the new state.
          vscode.window.showInformationMessage(
            newState
              ? 'Database polling enabled'
              : 'Database polling disabled — no COUNT queries will be issued',
          );

          // Refresh the tools tree so the item label can update if needed.
          toolsProvider.refresh();
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Toggle polling failed: ${msg}`);
        }
      },
    ),
  );
}
