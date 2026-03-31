/**
 * Connection diagnostics and walkthrough commands.
 * Extracted from nav-commands-core to keep files under the line cap.
 */
import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { ServerManager } from '../server-manager';
import type { ServerDiscovery } from '../server-discovery';
import type { SchemaSearchViewProvider } from '../schema-search/schema-search-view';

/** Register diagnostic and walkthrough commands. */
export function registerDiagnosticsCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
  serverManager: ServerManager,
  discovery: ServerDiscovery,
  connectionChannel: vscode.OutputChannel,
  log: (msg: string) => void,
  schemaSearchProvider?: SchemaSearchViewProvider,
): void {
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
      if (schemaSearchProvider) {
        const ss = schemaSearchProvider.getDiagnosticState();
        lines.push(
          `schemaSearch.viewResolved=${ss.viewResolved}`,
          `schemaSearch.webviewReady=${ss.webviewReady}`,
          `schemaSearch.presentationConnected=${ss.presentationConnected}`,
          `schemaSearch.presentationLabel=${ss.presentationLabel}`,
          `schemaSearch.discoveryActivity=${ss.discoveryActivity}`,
        );
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
      for (const line of lines) connectionChannel.appendLine(line);
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
        void vscode.window.showErrorMessage(`Failed to open walkthrough: ${msg}`);
      }
    }),
  );
}
