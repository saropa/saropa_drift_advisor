import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { DataBreakpointProvider } from './data-breakpoint-provider';
import type { TableItem } from '../tree/tree-items';
import { BreakpointFormPanel } from './breakpoint-form-panel';

/** Register data breakpoint commands. */
export function registerDataBreakpointCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
  dbpProvider: DataBreakpointProvider,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.addDataBreakpoint',
      async (item?: TableItem) => {
        try {
          // Open the breakpoint form webview — all inputs collected in one view
          await BreakpointFormPanel.open(client, dbpProvider, item?.table.name);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Data breakpoint failed: ${msg}`);
        }
      },
    ),
    vscode.commands.registerCommand(
      'driftViewer.removeDataBreakpoint',
      (id: string) => dbpProvider.remove(id),
    ),
    vscode.commands.registerCommand(
      'driftViewer.toggleDataBreakpoint',
      (id: string) => dbpProvider.toggle(id),
    ),
  );
}
