import * as vscode from 'vscode';
import { runAdbForward } from '../android-forward';
import type { DriftApiClient } from '../api-client';
import type { SchemaDiagnostics } from '../linter/schema-diagnostics';
import type { EditingBridge } from '../editing/editing-bridge';
import type { FilterBridge } from '../filters/filter-bridge';
import type { FkNavigator } from '../navigation/fk-navigator';
import type { ServerManager } from '../server-manager';
import type { ServerDiscovery } from '../server-discovery';
import { DriftViewerPanel } from '../panel';

/** Register navigation, linter, and discovery commands. */
export function registerNavCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
  linter: SchemaDiagnostics,
  editingBridge: EditingBridge,
  fkNavigator: FkNavigator,
  serverManager: ServerManager,
  discovery: ServerDiscovery,
  filterBridge: FilterBridge,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.openInBrowser', async () => {
      if (client.usingVmService && !serverManager.activeServer) {
        await vscode.window.showInformationMessage(
          'Open in browser is only available when the app is reachable over HTTP. Use the Database tree while connected via VM Service.',
        );
        return;
      }
      await vscode.env.openExternal(
        vscode.Uri.parse(`http://${client.host}:${client.port}`),
      );
    }),
  );

  const openInPanelOptions = (): { vmOnly?: boolean } | undefined => {
    if (client.usingVmService && !serverManager.activeServer) {
      return { vmOnly: true };
    }
    return undefined;
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.openInPanel', () => {
      DriftViewerPanel.createOrShow(
        client.host, client.port, editingBridge, fkNavigator, filterBridge,
        openInPanelOptions(),
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.viewTableInPanel',
      (_tableName: string) => {
        DriftViewerPanel.createOrShow(
          client.host, client.port, editingBridge, fkNavigator, filterBridge,
          openInPanelOptions(),
        );
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.runTableQuery',
      async (tableName: string) => {
        try {
          const result = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Querying ${tableName}\u2026`,
            },
            () => client.sql(`SELECT * FROM "${tableName}"`),
          );
          const doc = await vscode.workspace.openTextDocument({
            content: JSON.stringify(result.rows, null, 2),
            language: 'json',
          });
          await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Query failed: ${msg}`);
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.runLinter', () =>
      linter.refresh(),
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.copySuggestedSql',
      (sql: string) => {
        vscode.env.clipboard.writeText(sql);
      },
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.runIndexSql',
      async (sql: string) => {
        try {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'Creating index\u2026',
            },
            () => client.sql(sql),
          );
          vscode.window.showInformationMessage('Index created successfully.');
          linter.refresh();
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Failed to create index: ${msg}`);
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.selectServer', async () => {
      try {
        await serverManager.selectServer();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`Select Server failed: ${msg}`);
      }
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.retryDiscovery', () => {
      try {
        discovery.retry();
        void vscode.window.showInformationMessage(
          'Retrying server discovery… Check Output → Saropa Drift Advisor for details.',
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`Retry discovery failed: ${msg}`);
      }
    }),
  );

  /** Forward host port to Android emulator so the extension can reach the Drift server. */
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.forwardPortAndroid', async () => {
      const port = client.port;
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Forwarding port ${port} to Android…`,
            cancellable: false,
          },
          () => runAdbForward(port),
        );
        discovery.retry();
        void vscode.window.showInformationMessage(
          `Port ${port} forwarded. Retrying discovery…`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(
          `adb forward failed: ${msg}. Ensure an emulator or device is running and adb is on PATH. Run manually: adb forward tcp:${port} tcp:${port}`,
        );
      }
    }),
  );
}
