import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { ChangeTracker } from './change-tracker';
import type { ChangeItem } from './pending-changes-provider';
import { orderPendingChangesForApply } from './apply-order';
import { generateSql, generateSqlStatements } from './sql-generator';
import { WatchManager } from '../watch/watch-manager';
import { WatchPanel } from '../watch/watch-panel';
import { SqlNotebookPanel } from '../sql-notebook/sql-notebook-panel';
import { TableItem } from '../tree/tree-items';
import { BulkEditPanel } from '../bulk-edit/bulk-edit-panel';

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
        vscode.window.showInformationMessage(
          'No pending data edits. Edit cells in a table viewer, then use Preview SQL again.',
        );
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
    vscode.commands.registerCommand('driftViewer.commitPendingEdits', async () => {
      if (changeTracker.changeCount === 0) {
        void vscode.window.showInformationMessage('No pending data edits to apply.');
        return;
      }
      if (client.usingVmService) {
        void vscode.window.showErrorMessage(
          'Applying pending edits needs HTTP access to the Drift debug server (with writeQuery). ' +
            'VM Service–only mode does not expose batch apply.',
        );
        return;
      }
      let writeEnabled = false;
      try {
        const health = await client.health();
        writeEnabled = health.writeEnabled === true;
      } catch (err: unknown) {
        const detail = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`Could not reach server: ${detail}`);
        return;
      }
      if (!writeEnabled) {
        void vscode.window
          .showWarningMessage(
            'Writes are not enabled on this server. Configure writeQuery on DriftDebugServer.start(), then retry.',
            'View Docs',
          )
          .then((choice) => {
            if (choice === 'View Docs') {
              void vscode.env.openExternal(
                vscode.Uri.parse('https://drift.simonbinder.eu/docs/platforms/remote/'),
              );
            }
          });
        return;
      }
      let ordered = [...changeTracker.changes];
      try {
        const meta = await client.schemaMetadata({ includeForeignKeys: true });
        const fkEdges = meta.flatMap((t) =>
          (t.foreignKeys ?? []).map((fk) => ({
            fromTable: t.name,
            toTable: fk.toTable,
          })),
        );
        ordered = orderPendingChangesForApply(changeTracker.changes, fkEdges);
      } catch {
        /* If schema cannot load, apply in original pending order. */
      }
      const statements = generateSqlStatements(ordered);
      const confirm = await vscode.window.showWarningMessage(
        `Apply ${statements.length} SQL statement(s) to the database in one transaction? ` +
          'This cannot be undone from the extension.',
        { modal: true },
        'Apply',
      );
      if (confirm !== 'Apply') {
        return;
      }
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Applying pending edits…',
          },
          () => client.applyEditsBatch(statements),
        );
        changeTracker.discardAll();
        void vscode.window.showInformationMessage(
          `Applied ${statements.length} statement(s). Pending edit list cleared.`,
        );
      } catch (err: unknown) {
        const detail = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`Apply failed: ${detail}`);
      }
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.editTableData',
      async (item?: TableItem) => {
        if (item) {
          const pk = item.table.columns.find((c) => c.pk);
          if (!pk) {
            void vscode.window.showWarningMessage(
              `Table "${item.table.name}" has no primary key column — editing needs stable row identity.`,
            );
            return;
          }
        }
        BulkEditPanel.createOrShow(context, changeTracker);
      },
    ),
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
