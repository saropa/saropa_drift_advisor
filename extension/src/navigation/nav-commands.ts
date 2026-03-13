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
      await vscode.env.openExternal(
        vscode.Uri.parse(`http://${client.host}:${client.port}`),
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.openInPanel', () => {
      DriftViewerPanel.createOrShow(client.host, client.port, editingBridge, fkNavigator, filterBridge);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.viewTableInPanel',
      (_tableName: string) => {
        DriftViewerPanel.createOrShow(client.host, client.port, editingBridge, fkNavigator, filterBridge);
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
    vscode.commands.registerCommand('driftViewer.selectServer', () =>
      serverManager.selectServer(),
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.retryDiscovery', () =>
      discovery.retry(),
    ),
  );

  /** Forward host port to Android emulator so the extension can reach the Drift server. */
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.forwardPortAndroid', async () => {
      const port = client.port;
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Forwarding port to Android…',
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
