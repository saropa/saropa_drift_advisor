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
import { getLogVerbosity, shouldLogConnectionLine } from '../log-verbosity';
import type { SchemaSearchViewProvider } from '../schema-search/schema-search-view';
import { SAROPA_DRIFT_CONNECTION_DOC_URL } from '../help-urls';

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
  refreshConnectionUi?: () => void,
  /** Optional Schema Search provider for including webview state in diagnostics. */
  schemaSearchProvider?: SchemaSearchViewProvider,
): void {
  // Timestamped log to connection output channel for welcome-view and status-bar commands.
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
    if (client.usingVmService && !serverManager.activeServer) {
      return { vmOnly: true };
    }
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
    vscode.commands.registerCommand('driftViewer.runLinter', () => {
      log('Run Linter: triggered by user');
      try {
        linter.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`Run Linter: failed — ${msg}`);
        void vscode.window.showErrorMessage(`Linter failed: ${msg}`);
      }
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.copySuggestedSql',
      async (sql: string) => {
        try {
          await vscode.env.clipboard.writeText(sql);
          void vscode.window.showInformationMessage('SQL copied to clipboard.');
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log(`Copy SQL: failed — ${msg}`);
          void vscode.window.showErrorMessage(`Failed to copy SQL: ${msg}`);
        }
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

  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.pauseDiscovery', () => {
      log('Pause Discovery: triggered by user');
      try {
        const discOn =
          vscode.workspace.getConfiguration('driftViewer').get<boolean>('discovery.enabled', true) !== false;
        if (!discOn) {
          void vscode.window.showWarningMessage(
            'Discovery is disabled in settings (driftViewer.discovery.enabled).',
          );
          return;
        }
        discovery.pause();
        void vscode.window.showInformationMessage(
          'Discovery paused. Use Resume or Scan now in Schema Search when you want scans again.',
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`Pause Discovery: failed — ${msg}`);
        void vscode.window.showErrorMessage(`Pause discovery failed: ${msg}`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.resumeDiscovery', () => {
      log('Resume Discovery: triggered by user');
      try {
        discovery.resume();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`Resume Discovery: failed — ${msg}`);
        void vscode.window.showErrorMessage(`Resume discovery failed: ${msg}`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.openConnectionHelp', () => {
      log('Open Connection Help: triggered by user');
      void vscode.env.openExternal(vscode.Uri.parse(SAROPA_DRIFT_CONNECTION_DOC_URL));
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.showConnectionLog', () => {
      log('Show Connection Log: triggered by user');
      connectionChannel.show(true);
      void vscode.window.showInformationMessage(
        'Opened Output → Saropa Drift Advisor. Enable verbose logging in settings for more detail.',
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.refreshConnectionUi', () => {
      log('Refresh Connection UI: triggered by user');
      try {
        refreshConnectionUi?.();
        void vscode.window.showInformationMessage(
          'Sidebar connection state refreshed. Check Output if issues persist.',
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`Refresh Connection UI: failed — ${msg}`);
        void vscode.window.showErrorMessage(`Refresh connection UI failed: ${msg}`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.diagnoseConnection', async () => {
      log('Diagnose Connection: started');
      connectionChannel.show(true);
      const stamp = new Date().toISOString();
      const driftCfg = vscode.workspace.getConfiguration('driftViewer');
      const authTok = driftCfg.get<string>('authToken', '') ?? '';
      const lines: string[] = [
        `--- Diagnose Connection (${stamp}) ---`,
        `extension driftViewer.enabled=${driftCfg.get('enabled')}`,
        `driftViewer.authToken configured=${authTok.length > 0 ? 'yes' : 'no'} (value not logged)`,
        `discovery.enabled=${driftCfg.get('discovery.enabled')}`,
        `activeServer=${serverManager.activeServer ? `${serverManager.activeServer.host}:${serverManager.activeServer.port}` : 'none'}`,
        `discovery.state=${discovery.state} ports=[${discovery.servers.map((s) => s.port).join(', ') || 'none'}]`,
        `client.usingVmService=${client.usingVmService}`,
        `client.baseUrl=${client.baseUrl}`,
      ];

      // Schema Search webview diagnostics — helps spot stuck-loading or
      // missed-handshake issues where the sidebar never finishes initialising.
      if (schemaSearchProvider) {
        const ss = schemaSearchProvider.getDiagnosticState();
        lines.push(
          `schemaSearch.viewResolved=${ss.viewResolved}`,
          `schemaSearch.webviewReady=${ss.webviewReady}`,
          `schemaSearch.presentationConnected=${ss.presentationConnected}`,
          `schemaSearch.presentationLabel=${ss.presentationLabel}`,
          `schemaSearch.discoveryActivity=${ss.discoveryActivity}`,
        );
        // Flag common failure patterns so developers can self-diagnose.
        if (!ss.viewResolved) {
          lines.push(
            '  ⚠ Webview not resolved — VS Code has not called resolveWebviewView yet.',
            '    Check: is the Drift sidebar visible? Is driftViewer.serverConnected set?',
          );
        } else if (!ss.webviewReady) {
          lines.push(
            '  ⚠ Webview resolved but script not ready — the ready handshake was not received.',
            '    Check: Content Security Policy errors in Developer Tools (Help → Toggle Developer Tools).',
          );
        } else if (!ss.presentationConnected) {
          lines.push(
            '  ⚠ Webview ready but presentation says "not connected".',
            '    Check: server is running, discovery found it, refreshDriftConnectionUi was called.',
          );
        }
      }
      try {
        const health = await client.health();
        lines.push(`health() → ${JSON.stringify(health)}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        lines.push(`health() FAILED → ${msg}`);
      }
      lines.push('--- end diagnose ---');
      for (const line of lines) {
        connectionChannel.appendLine(line);
      }
      log('Diagnose Connection: complete (see Output)');
      const pick = await vscode.window.showInformationMessage(
        'Connection diagnosis written to Output → Saropa Drift Advisor.',
        'Copy summary',
        'Close',
      );
      if (pick === 'Copy summary') {
        const summary = lines.filter((l) => !l.startsWith('---')).join('\n');
        await vscode.env.clipboard.writeText(summary);
        void vscode.window.showInformationMessage('Diagnosis summary copied to clipboard.');
      }
    }),
  );

  // Open the Getting Started walkthrough so users can discover features step by step.
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.openWalkthrough', async () => {
      log('Open Walkthrough: triggered by user');
      try {
        await vscode.commands.executeCommand(
          'workbench.action.openWalkthrough',
          'saropa.drift-viewer#driftViewer.gettingStarted',
          false,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`Open Walkthrough: failed — ${msg}`);
        void vscode.window.showErrorMessage(
          `Failed to open walkthrough: ${msg}`,
        );
      }
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
