/**
 * tree-refresh-command.ts
 *
 * Registers the Database sidebar "Refresh" toolbar action as its own isolated
 * command.  This is intentionally separated from the bulk tree-command
 * registrations so it can be wired up as early as possible during extension
 * activation — the refresh button should work even if a later activation step
 * throws before full command registration completes.
 */

import * as vscode from 'vscode';
import type { DriftTreeProvider } from './drift-tree-provider';

/**
 * Registers only the Database sidebar "Refresh" action as early as possible so the
 * toolbar works even if a later activation step throws before full command registration.
 */
export function registerRefreshTreeCommand(
  context: vscode.ExtensionContext,
  treeProvider: DriftTreeProvider,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.refreshTree', async () => {
      try {
        // Show a progress notification immediately so the user knows the button
        // worked. On Windows the fetch safety timeout can take up to ~10s per
        // request, so without this the UI appears frozen after clicking Refresh.
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Drift: Refreshing database tree…',
            cancellable: false,
          },
          async () => {
            await treeProvider.refresh();
          },
        );
        if (treeProvider.connected) {
          void vscode.window.showInformationMessage(
            'Database tree refreshed — schema loaded.',
          );
        } else if (treeProvider.offlineSchema) {
          void vscode.window
            .showWarningMessage(
              'Database tree shows cached schema only; live REST API was not reachable.',
              'Retry',
            )
            .then((choice) => {
              if (choice === 'Retry') {
                void vscode.commands.executeCommand('driftViewer.refreshTree');
              }
            });
        } else {
          void vscode.window
            .showWarningMessage(
              'Could not load schema from the REST API. Check driftViewer.authToken, host/port, '
                + 'VPN/WSL, and that Select Server points at the running app.',
              'Open Settings',
            )
            .then((choice) => {
              if (choice === 'Open Settings') {
                void vscode.commands.executeCommand(
                  'workbench.action.openSettings',
                  'driftViewer',
                );
              }
            });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(
          `Refresh tree failed: ${msg}`,
        );
      }
    }),
  );
}
