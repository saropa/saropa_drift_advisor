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
import { snakeToPascal } from '../dart-names';
import {
  findDriftColumnGetterLocation,
  findDriftTableClassLocation,
  openLocationOrNotify,
  type ColumnSearchResult,
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
      (item: TableItem) => {
        try {
          pinStore.pin(item.table.name);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          void vscode.window.showErrorMessage(`Pin table failed: ${msg}`);
        }
      },
    ),
    vscode.commands.registerCommand(
      'driftViewer.unpinTable',
      (item: TableItem) => {
        try {
          pinStore.unpin(item.table.name);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          void vscode.window.showErrorMessage(`Unpin table failed: ${msg}`);
        }
      },
    ),
    pinStore.onDidChange(() => treeProvider.refresh()),
    { dispose: () => pinStore.dispose() },
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.goToDriftTableDefinition',
      async (item: TableItem) => {
        try {
          const result = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Searching for table "${item.table.name}" in Dart sources…`,
              cancellable: false,
            },
            () => findDriftTableClassLocation(item.table.name),
          );
          if (result.location) {
            await openLocationOrNotify(result.location, `table "${item.table.name}"`);
          } else {
            void vscode.window.showWarningMessage(
              `Could not find "class ${snakeToPascal(item.table.name)} extends …Table" `
                + `in ${result.filesSearched} .dart source files. `
                + `Is the Dart project open in this workspace?`,
            );
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          void vscode.window.showErrorMessage(
            `Go to Table Definition failed: ${msg}`,
          );
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.goToDriftColumnDefinition',
      async (item: ColumnItem) => {
        try {
          const result: ColumnSearchResult = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Searching for column "${item.column.name}" in Dart sources…`,
              cancellable: false,
            },
            () => findDriftColumnGetterLocation(item.column.name, item.tableName),
          );

          if (result.location) {
            // Exact getter found — open it.
            await openLocationOrNotify(
              result.location,
              `column "${item.column.name}" on table "${item.tableName}"`,
            );
          } else if (result.tableClassFallback) {
            // Getter not matched but the table class was found — open the
            // class so the user can navigate manually from there.
            void vscode.window.showWarningMessage(
              `Could not find a "get ${item.column.name} =>" getter — `
                + `opening the table class instead.`,
            );
            await openLocationOrNotify(
              result.tableClassFallback,
              `table "${item.tableName}"`,
            );
          } else {
            // Neither table class nor getter found anywhere.
            void vscode.window.showWarningMessage(
              `Could not find table "${item.tableName}" in ${result.filesSearched} .dart source files. `
                + `Is the Dart project open in this workspace?`,
            );
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          void vscode.window.showErrorMessage(
            `Go to Column Definition failed: ${msg}`,
          );
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.viewTableData',
      (_item: TableItem) => {
        try {
          DriftViewerPanel.createOrShow(
            client.host, client.port, editingBridge, fkNavigator, filterBridge,
            panelOptions(),
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          void vscode.window.showErrorMessage(`View Table Data failed: ${msg}`);
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.copyTableName',
      (item: TableItem) => {
        try {
          vscode.env.clipboard.writeText(item.table.name);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          void vscode.window.showErrorMessage(`Copy Table Name failed: ${msg}`);
        }
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
          void vscode.window.showErrorMessage(`Export failed: ${msg}`);
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.copyColumnName',
      (item: ColumnItem) => {
        try {
          vscode.env.clipboard.writeText(item.column.name);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          void vscode.window.showErrorMessage(`Copy Column Name failed: ${msg}`);
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.filterByColumn',
      (_item: ColumnItem) => {
        try {
          DriftViewerPanel.createOrShow(
            client.host, client.port, editingBridge, fkNavigator, filterBridge,
            panelOptions(),
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          void vscode.window.showErrorMessage(`Filter by Column failed: ${msg}`);
        }
      },
    ),
  );

  // Save Current Filter: opens/focuses the Data Viewer so the user can use the
  // in-panel Save Filter control. Filter state is in the webview; saving is
  // triggered from the panel UI via FilterBridge messages.
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.saveFilter', () => {
      try {
        DriftViewerPanel.createOrShow(
          client.host, client.port, editingBridge, fkNavigator, filterBridge,
          panelOptions(),
        );
        void vscode.window.showInformationMessage(
          'Use the Save Filter control in the Data Viewer panel to save the current filter.',
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`Save Filter failed: ${msg}`);
      }
    }),
  );
}
