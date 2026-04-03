import * as vscode from 'vscode';
import type { SnapshotStore } from '../timeline/snapshot-store';
import { ChangelogFormPanel } from './changelog-form-panel';

/** Register the snapshotChangelog command. */
export function registerChangelogCommands(
  context: vscode.ExtensionContext,
  snapshotStore: SnapshotStore,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.snapshotChangelog',
      () => {
        const snapshots = snapshotStore.snapshots;
        if (snapshots.length < 2) {
          void vscode.window
            .showWarningMessage(
              'Need at least 2 snapshots to generate a changelog.',
              'Take Snapshot',
            )
            .then((choice) => {
              if (choice === 'Take Snapshot') {
                void vscode.commands.executeCommand('driftViewer.captureSnapshot');
              }
            });
          return;
        }
        // Open the changelog form webview — both snapshot pickers in one view
        ChangelogFormPanel.open(snapshotStore);
      },
    ),
  );
}
