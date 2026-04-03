import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { TableItem } from '../tree/tree-items';
import { CompareFormPanel } from './compare-form-panel';

/** Register the compareRows command. */
export function registerComparatorCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.compareRows',
      async (item?: TableItem) => {
        try {
          // Open the compare form webview — all inputs collected in one view
          await CompareFormPanel.open(client, item?.table.name);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Compare failed: ${msg}`);
        }
      },
    ),
  );
}
