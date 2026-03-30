import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { DriftTreeProvider } from './drift-tree-provider';
import type { EditingBridge } from '../editing/editing-bridge';
import type { FilterBridge } from '../filters/filter-bridge';
import type { FkNavigator } from '../navigation/fk-navigator';
import type { ServerManager } from '../server-manager';
import { DriftViewerPanel } from '../panel';
import { PinStore } from './pin-store';
import { ColumnItem, TableItem } from './tree-items';
import { exportTable } from '../export/format-export';
import {
  findDriftColumnGetterLocation,
  findDriftTableClassLocation,
  openLocationOrNotify,
} from '../definition/drift-source-locator';

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
        void vscode.window.showWarningMessage(
          'Database tree shows cached schema only; live REST API was not reachable.',
        );
      } else {
        void vscode.window.showWarningMessage(
          'Could not load schema from the REST API. Check driftViewer.authToken, host/port, '
            + 'VPN/WSL, and that Select Server points at the running app.',
        );
      }
    }),
  );
}

/** Register tree view commands including pin support. */
export function registerTreeCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
  treeProvider: DriftTreeProvider,
  editingBridge: EditingBridge,
  fkNavigator: FkNavigator,
  filterBridge: FilterBridge,
  serverManager: ServerManager,
): void {
  const panelOptions = (): { vmOnly?: boolean } | undefined =>
    client.usingVmService && !serverManager.activeServer ? { vmOnly: true } : undefined;
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
    vscode.commands.registerCommand(
      'driftViewer.goToDriftTableDefinition',
      async (item: TableItem) => {
        const loc = await findDriftTableClassLocation(item.table.name);
        await openLocationOrNotify(loc, `table "${item.table.name}"`);
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.goToDriftColumnDefinition',
      async (item: ColumnItem) => {
        const loc = await findDriftColumnGetterLocation(
          item.column.name,
          item.tableName,
        );
        await openLocationOrNotify(
          loc,
          `column "${item.column.name}" on table "${item.tableName}"`,
        );
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.viewTableData',
      (_item: TableItem) => {
        DriftViewerPanel.createOrShow(
          client.host, client.port, editingBridge, fkNavigator, filterBridge,
          panelOptions(),
        );
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
        DriftViewerPanel.createOrShow(
          client.host, client.port, editingBridge, fkNavigator, filterBridge,
          panelOptions(),
        );
      },
    ),
  );

  // Save Current Filter: opens/focuses the Data Viewer so the user can use the
  // in-panel Save Filter control. Filter state is in the webview; saving is
  // triggered from the panel UI via FilterBridge messages.
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.saveFilter', () => {
      DriftViewerPanel.createOrShow(
        client.host, client.port, editingBridge, fkNavigator, filterBridge,
        panelOptions(),
      );
      void vscode.window.showInformationMessage(
        'Use the Save Filter control in the Data Viewer panel to save the current filter.',
      );
    }),
  );
}
