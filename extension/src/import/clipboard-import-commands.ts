/**
 * Command registration for clipboard import functionality.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import { ClipboardImportPanel } from './clipboard-import-panel';
import { ImportHistory, formatHistoryEntry } from './import-history';
import { ImportExecutor } from './import-executor';

export function registerClipboardImportCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
): void {
  const history = new ImportHistory(context.workspaceState);

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.clipboardImport',
      async (item?: { label?: string }) => {
        let tableName: string | undefined;

        if (item?.label) {
          tableName = item.label;
        } else {
          const tables = await client.schemaMetadata();
          const items = tables.map((t) => ({
            label: t.name,
            description: `${t.rowCount} rows`,
          }));

          const picked = await vscode.window.showQuickPick(items, {
            title: 'Paste from Clipboard: Select target table',
            placeHolder: 'Choose table to import into',
          });

          if (!picked) {
            return;
          }
          tableName = picked.label;
        }

        try {
          const tables = await client.schemaMetadata();
          const tableInfo = tables.find((t) => t.name === tableName);

          if (!tableInfo) {
            vscode.window.showErrorMessage(`Table "${tableName}" not found`);
            return;
          }

          await ClipboardImportPanel.createOrShow(
            client,
            context.workspaceState,
            tableName,
            tableInfo.columns,
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Failed to load table: ${message}`);
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.undoClipboardImport',
      async () => {
        const recent = history.getRecent(10).filter((e) => e.canUndo);

        if (recent.length === 0) {
          vscode.window.showInformationMessage('No undoable imports in history');
          return;
        }

        const items = recent.map((e) => ({
          label: formatHistoryEntry(e),
          id: e.id,
          table: e.table,
          insertedIds: e.insertedIds,
          updatedRows: e.updatedRows,
        }));

        const picked = await vscode.window.showQuickPick(items, {
          title: 'Undo Import',
          placeHolder: 'Select import to undo',
        });

        if (!picked) {
          return;
        }

        const confirm = await vscode.window.showWarningMessage(
          `Undo import? This will delete ${picked.insertedIds.length} inserted rows and restore ${picked.updatedRows.length} updated rows.`,
          'Undo',
          'Cancel',
        );

        if (confirm !== 'Undo') {
          return;
        }

        try {
          const tables = await client.schemaMetadata();
          const tableInfo = tables.find((t) => t.name === picked.table);
          const pkColumn = tableInfo?.columns.find((c) => c.pk)?.name ?? 'id';

          const executor = new ImportExecutor(client);
          const result = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'Undoing import…',
            },
            () => executor.undoImport(
              picked.table,
              picked.insertedIds,
              picked.updatedRows,
              pkColumn,
            ),
          );

          if (result.success) {
            history.removeEntry(picked.id);
            vscode.window.showInformationMessage('Import undone successfully');
          } else {
            vscode.window.showErrorMessage(`Undo failed: ${result.error}`);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Undo failed: ${message}`);
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.showImportHistory',
      async () => {
        const recent = history.getRecent(20);

        if (recent.length === 0) {
          vscode.window.showInformationMessage('No import history');
          return;
        }

        const items = recent.map((e) => ({
          label: formatHistoryEntry(e),
          detail: `${e.insertedIds.length} inserted, ${e.updatedRows.length} updated`,
        }));

        await vscode.window.showQuickPick(items, {
          title: 'Import History',
          placeHolder: 'Recent clipboard imports',
        });
      },
    ),
  );
}
