import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { ChangeTracker } from './change-tracker';
import type { ChangeItem } from './pending-changes-provider';
import { generateSql } from './sql-generator';
import { WatchManager } from '../watch/watch-manager';
import { WatchPanel } from '../watch/watch-panel';
import { SqlNotebookPanel } from '../sql-notebook/sql-notebook-panel';
import { TableItem } from '../tree/tree-items';

/** Register watch and data editing commands. */
export function registerEditingCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
  changeTracker: ChangeTracker,
  watchManager: WatchManager,
): void {
  // Watch commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.watchTable',
      (item: TableItem) => {
        watchManager.add(
          `SELECT * FROM "${item.table.name}"`,
          item.table.name,
          item.table.columns,
        );
        WatchPanel.createOrShow(context, watchManager);
      },
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.watchQuery',
      (sql: string) => {
        watchManager.add(sql, sql.substring(0, 40));
        WatchPanel.createOrShow(context, watchManager);
      },
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.openWatchPanel', () => {
      WatchPanel.createOrShow(context, watchManager);
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.openSqlNotebook', () => {
      SqlNotebookPanel.createOrShow(context, client);
    }),
  );

  // Data editing commands
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.generateSql', async () => {
      if (changeTracker.changeCount === 0) {
        vscode.window.showInformationMessage('No pending edits.');
        return;
      }
      changeTracker.logGenerateSql();
      const sql = generateSql(changeTracker.changes);
      const doc = await vscode.workspace.openTextDocument({
        content: sql,
        language: 'sql',
      });
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.discardAllEdits',
      async () => {
        if (changeTracker.changeCount === 0) return;
        const answer = await vscode.window.showWarningMessage(
          `Discard ${changeTracker.changeCount} pending edit(s)?`,
          { modal: true },
          'Discard',
        );
        if (answer === 'Discard') {
          changeTracker.discardAll();
        }
      },
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.undoEdit', () =>
      changeTracker.undo(),
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.redoEdit', () =>
      changeTracker.redo(),
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.toggleEditing', () => {
      const active = changeTracker.changeCount > 0;
      vscode.commands.executeCommand(
        'setContext',
        'driftViewer.editingActive',
        !active,
      );
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.removeChange',
      (item: ChangeItem) => {
        changeTracker.removeChange(item.change.id);
      },
    ),
  );
}
