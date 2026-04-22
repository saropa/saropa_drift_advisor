import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { DiagnosticManager } from '../diagnostics/diagnostic-manager';
import type { EditingBridge } from '../editing/editing-bridge';
import type { FilterBridge } from '../filters/filter-bridge';
import type { FkNavigator } from '../navigation/fk-navigator';
import type { ServerManager } from '../server-manager';
import type { ServerDiscovery } from '../server-discovery';
import { DriftViewerPanel } from '../panel';
import { getLogVerbosity, shouldLogConnectionLine } from '../log-verbosity';
import { registerDiscoveryCommands } from './nav-commands-discovery';
import { registerDiagnosticsCommands } from './nav-commands-diagnostics';

/** Register navigation, diagnostic, and discovery commands. */
export function registerNavCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
  diagnosticManager: DiagnosticManager,
  editingBridge: EditingBridge,
  fkNavigator: FkNavigator,
  serverManager: ServerManager,
  discovery: ServerDiscovery,
  filterBridge: FilterBridge,
  connectionChannel: vscode.OutputChannel,
  refreshConnectionUi?: () => void,
): void {
  let verbosity = getLogVerbosity(
    vscode.workspace.getConfiguration('driftViewer'),
  );
  const log = (msg: string): void => {
    const line = `[${new Date().toISOString()}] ${msg}`;
    if (shouldLogConnectionLine(line, verbosity)) {
      connectionChannel.appendLine(line);
    }
  };
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('driftViewer.logVerbosity')) {
        verbosity = getLogVerbosity(vscode.workspace.getConfiguration('driftViewer'));
      }
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.openInBrowser', async () => {
      log('Open in Browser: triggered by user');
      if (client.usingVmService && !serverManager.activeServer) {
        log('Open in Browser: blocked — VM Service mode with no active server');
        await vscode.window.showInformationMessage(
          'Open in browser is only available when the app is reachable over HTTP. Use the Database tree while connected via VM Service.',
        );
        return;
      }
      const url = `http://${client.host}:${client.port}`;
      try {
        log(`Open in Browser: opening ${url}`);
        const opened = await vscode.env.openExternal(vscode.Uri.parse(url));
        if (!opened) {
          log('Open in Browser: openExternal returned false');
          void vscode.window.showWarningMessage(
            `Could not open ${url} in browser. Check your default browser settings.`,
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`Open in Browser: failed — ${msg}`);
        void vscode.window.showErrorMessage(
          `Failed to open browser: ${msg}`,
        );
      }
    }),
  );
  const openInPanelOptions = (): { vmOnly?: boolean } | undefined => {
    if (client.usingVmService && !serverManager.activeServer) return { vmOnly: true };
    return undefined;
  };
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.openInPanel', () => {
      log('Open in Panel: triggered by user');
      try {
        DriftViewerPanel.createOrShow(
          client.host, client.port, editingBridge, fkNavigator, filterBridge,
          openInPanelOptions(),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`Open in Panel: failed — ${msg}`);
        void vscode.window.showErrorMessage(`Failed to open panel: ${msg}`);
      }
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.viewTableInPanel',
      (_tableName: string) => {
        log('View Table in Panel: triggered by user');
        try {
          DriftViewerPanel.createOrShow(
            client.host, client.port, editingBridge, fkNavigator, filterBridge,
            openInPanelOptions(),
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log(`View Table in Panel: failed — ${msg}`);
          void vscode.window.showErrorMessage(`Failed to open panel: ${msg}`);
        }
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
              title: `Querying ${tableName}…`,
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
    vscode.commands.registerCommand('driftViewer.runLinter', () => {
      log('Run Linter: triggered by user');
      // `Run Linter` is the user's manual "re-scan now" trigger. It
      // used to drive the legacy `SchemaDiagnostics` pipeline; that
      // pipeline has been retired in favor of the unified
      // `DiagnosticManager`, so the command now kicks the same
      // refresh that schema changes / file saves already trigger.
      // Errors are swallowed inside `DiagnosticManager.refresh()`,
      // so the try/catch here exists only to catch truly unexpected
      // failures at the promise boundary.
      try {
        diagnosticManager.refresh().catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          log(`Run Linter: failed — ${msg}`);
          void vscode.window.showErrorMessage(`Linter failed: ${msg}`);
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`Run Linter: failed — ${msg}`);
        void vscode.window.showErrorMessage(`Linter failed: ${msg}`);
      }
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.copySuggestedSql', async (sql: string) => {
      try {
        await vscode.env.clipboard.writeText(sql);
        void vscode.window.showInformationMessage('SQL copied to clipboard.');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`Copy SQL: failed — ${msg}`);
        void vscode.window.showErrorMessage(`Failed to copy SQL: ${msg}`);
      }
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.refreshConnectionUi', () => {
      log('Refresh Connection UI: triggered by user');
      try {
        refreshConnectionUi?.();
        void vscode.window.showInformationMessage('Sidebar connection state refreshed. Check Output if issues persist.');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`Refresh Connection UI: failed — ${msg}`);
        void vscode.window.showErrorMessage(`Refresh connection UI failed: ${msg}`);
      }
    }),
  );

  // --- Delegate to sub-modules for discovery + diagnostics commands ---
  registerDiscoveryCommands(
    context, client.port, serverManager, discovery, connectionChannel, log,
  );
  registerDiagnosticsCommands(
    context, client, serverManager, discovery, connectionChannel, log,
  );
}
