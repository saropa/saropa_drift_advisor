import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { DriftTreeProvider } from './drift-tree-provider';
import type { EditingBridge } from '../editing/editing-bridge';
import type { FkNavigator } from '../navigation/fk-navigator';
import { DriftViewerPanel } from '../panel';
import { PinStore } from './pin-store';
import { ColumnItem, TableItem } from './tree-items';
import { exportTable } from '../export/format-export';

/** Register tree view commands including pin support. */
export function registerTreeCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
  treeProvider: DriftTreeProvider,
  editingBridge: EditingBridge,
  fkNavigator: FkNavigator,
): void {
  // Pin store — persists pinned tables per workspace
  const pinStore = new PinStore(context.workspaceState);
  treeProvider.setPinStore(pinStore);
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.pinTable',
      (item: TableItem) => pinStore.pin(item.table.name),
    ),
    vscode.commands.registerCommand(
      'driftViewer.unpinTable',
      (item: TableItem) => pinStore.unpin(item.table.name),
    ),
    pinStore.onDidChange(() => treeProvider.refresh()),
    { dispose: () => pinStore.dispose() },
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.refreshTree', () =>
      treeProvider.refresh(),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.viewTableData',
      (_item: TableItem) => {
        DriftViewerPanel.createOrShow(client.host, client.port, editingBridge, fkNavigator);
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.copyTableName',
      (item: TableItem) => {
        vscode.env.clipboard.writeText(item.table.name);
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.exportTable',
      async (item: TableItem) => {
        try {
          await exportTable(client, item.table.name);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Export failed: ${msg}`);
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.copyColumnName',
      (item: ColumnItem) => {
        vscode.env.clipboard.writeText(item.column.name);
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.filterByColumn',
      (_item: ColumnItem) => {
        DriftViewerPanel.createOrShow(client.host, client.port, editingBridge, fkNavigator);
      },
    ),
  );
}
