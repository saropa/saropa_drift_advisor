/**
 * Branch command registration (Feature 37, Phase 5).
 *
 * Owns the {@link BranchManager} lifecycle (one per workspace, persisted in workspace state) and
 * registers the two entry points: open the Branch Manager panel, and create a branch. Diff,
 * merge-SQL, restore, and delete are driven by buttons inside the panel rather than separate
 * command IDs, keeping the command surface small while the panel carries the workflow.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { ISnapshot } from '../timeline/snapshot-types';
import { BranchManager } from './branch-manager';
import { BranchPanel } from './branch-panel';
import { snapshotToBranchTables } from './snapshot-to-branch';

export function registerBranchCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
): void {
  const manager = new BranchManager(client, context.workspaceState);
  context.subscriptions.push({ dispose: () => manager.dispose() });

  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.openBranches', () => {
      BranchPanel.createOrShow(manager, client);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.createBranch', async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Branch name',
        placeHolder: 'e.g. before-migration, experiment-1',
        validateInput: (v) => (v.trim() ? null : 'Name required'),
      });
      if (!name) return;
      try {
        const branch = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: `Creating branch "${name.trim()}"…` },
          () => manager.createBranch(name.trim()),
        );
        vscode.window.showInformationMessage(
          `Branch "${branch.name}" created — ${branch.metadata.tableCount} tables, ${branch.metadata.totalRows.toLocaleString()} rows`
          + (branch.metadata.truncated ? ' (some tables truncated to the row cap)' : ''),
        );
        // Open the manager so the new branch is immediately visible and actionable.
        BranchPanel.createOrShow(manager, client);
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Could not create branch: ${m}`);
      }
    }),
  );

  // "Create Branch Here" (Feature 60 Phase 5): the Time-Travel panel passes the snapshot at the
  // current slider position; we persist its captured state as a branch. Snapshot-scoped, so it is
  // hidden from the command palette (a palette invocation arrives with no snapshot and no-ops).
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.branchFromSnapshot',
      async (snapshot?: ISnapshot) => {
        if (!snapshot) return;

        const captured = new Date(snapshot.timestamp);
        const name = await vscode.window.showInputBox({
          prompt: 'Branch name (from this snapshot)',
          value: `snapshot-${captured.toISOString().slice(11, 19).replace(/:/g, '')}`,
          validateInput: (v) => (v.trim() ? null : 'Name required'),
        });
        if (!name) return;

        const { tables, truncated } = snapshotToBranchTables(snapshot);
        if (tables.length === 0) {
          vscode.window.showWarningMessage('This snapshot has no user tables to branch.');
          return;
        }

        try {
          const branch = await manager.createBranchFromTables(
            name.trim(),
            tables,
            truncated,
            `Captured from time-travel snapshot at ${captured.toLocaleString()}`,
          );
          vscode.window.showInformationMessage(
            `Branch "${branch.name}" created from snapshot — ${branch.metadata.tableCount} tables, ${branch.metadata.totalRows.toLocaleString()} rows`
            + (branch.metadata.truncated ? ' (some tables truncated to the row cap)' : ''),
          );
          // Reveal the new branch so it is immediately diff/restore-able.
          BranchPanel.createOrShow(manager, client);
        } catch (err) {
          const m = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Could not create branch from snapshot: ${m}`);
        }
      },
    ),
  );
}
