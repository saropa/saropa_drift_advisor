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
  connectionChannel: vscode.OutputChannel,
): void {
  // Timestamped log to connection output channel for welcome-view and status-bar commands.
  const log = (msg: string): void => {
    connectionChannel.appendLine(`[${new Date().toISOString()}] ${msg}`);
  };

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

  // Welcome-view / status-bar: Select Server, Retry, Forward Port — each gives toast + output log.
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.selectServer', async () => {
      log('Select Server: triggered by user');
      try {
        await serverManager.selectServer();
        const active = serverManager.activeServer;
        if (active) {
          log(`Select Server: connected to :${active.port}`);
          void vscode.window.showInformationMessage(
            `Connected to Drift server on port :${active.port}`,
          );
        } else if (serverManager.servers.length > 0) {
          log('Select Server: dialog dismissed (servers were available)');
          void vscode.window.showInformationMessage(
            'No server selected. Use Select Server again to pick one.',
          );
        } else {
          log('Select Server: no servers found (warning already shown)');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`Select Server: failed — ${msg}`);
        void vscode.window.showErrorMessage(`Select Server failed: ${msg}`);
      }
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.retryDiscovery', () => {
      log('Retry Connection: triggered by user');
      void vscode.window.showInformationMessage(
        'Retrying server discovery… See Output → Saropa Drift Advisor for details.',
      );
      connectionChannel.show();
      try {
        discovery.retry();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`Retry Connection: failed — ${msg}`);
        void vscode.window.showErrorMessage(`Retry discovery failed: ${msg}`);
      }
    }),
  );

  // Open the Getting Started walkthrough so users can discover features step by step.
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.openWalkthrough', () => {
      vscode.commands.executeCommand(
        'workbench.action.openWalkthrough',
        'saropa.drift-viewer#driftViewer.gettingStarted',
        false,
      );
    }),
  );

  /** Forward host port to Android emulator so the extension can reach the Drift server. */
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.forwardPortAndroid', async () => {
      const port = client.port;
      log('Forward Port (Android Emulator): triggered by user');
      void vscode.window.showInformationMessage(
        `Forwarding port ${port} to Android… Check Output → Saropa Drift Advisor.`,
      );
      connectionChannel.show();
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Forwarding port ${port} to Android…`,
            cancellable: false,
          },
          () => runAdbForward(port),
        );
        log(`Forward Port: adb forward tcp:${port} tcp:${port} succeeded`);
        discovery.retry();
        void vscode.window.showInformationMessage(
          `Port ${port} forwarded. Retrying discovery…`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`Forward Port: failed — ${msg}`);
        void vscode.window.showErrorMessage(
          `adb forward failed: ${msg}. Ensure an emulator or device is running and adb is on PATH. Run manually: adb forward tcp:${port} tcp:${port}`,
        );
      }
    }),
  );
}
