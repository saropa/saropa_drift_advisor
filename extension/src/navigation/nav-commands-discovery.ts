/**
 * Server selection, discovery lifecycle, port forwarding, and connection log
 * commands. Extracted from nav-commands-core to keep files under the line cap.
 */
import * as vscode from 'vscode';
import { runAdbForward } from '../android-forward';
import type { ServerManager } from '../server-manager';
import type { ServerDiscovery } from '../server-discovery';
import { SAROPA_DRIFT_CONNECTION_DOC_URL } from '../help-urls';

/** Register discovery-related and connection-help commands. */
export function registerDiscoveryCommands(
  context: vscode.ExtensionContext,
  clientPort: number,
  serverManager: ServerManager,
  discovery: ServerDiscovery,
  connectionChannel: vscode.OutputChannel,
  log: (msg: string) => void,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.selectServer', async () => {
      log('Select Server: triggered by user');
      try {
        await serverManager.selectServer();
        const active = serverManager.activeServer;
        if (active) {
          log(`Select Server: connected to :${active.port}`);
          void vscode.window.showInformationMessage(`Connected to Drift server on port :${active.port}`);
        } else if (serverManager.servers.length > 0) {
          log('Select Server: dialog dismissed (servers were available)');
          void vscode.window.showInformationMessage('No server selected. Use Select Server again to pick one.');
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
      void vscode.window.showInformationMessage('Retrying server discovery… See Output → Saropa Drift Advisor for details.');
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
          void vscode.window
            .showWarningMessage(
              'Discovery is disabled in settings (driftViewer.discovery.enabled).',
              'Open Settings',
            )
            .then((choice) => {
              if (choice === 'Open Settings') {
                void vscode.commands.executeCommand(
                  'workbench.action.openSettings',
                  'driftViewer.discovery.enabled',
                );
              }
            });
          return;
        }
        discovery.pause();
        void vscode.window.showInformationMessage('Discovery paused. Use Resume or Scan now in Schema Search when you want scans again.');
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
      void vscode.window.showInformationMessage('Opening connection help in your browser…');
      void vscode.env.openExternal(vscode.Uri.parse(SAROPA_DRIFT_CONNECTION_DOC_URL));
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.showConnectionLog', () => {
      log('Show Connection Log: triggered by user');
      connectionChannel.show(true);
      void vscode.window.showInformationMessage('Opened Output → Saropa Drift Advisor. Enable verbose logging in settings for more detail.');
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.forwardPortAndroid', async () => {
      const port = clientPort;
      log('Forward Port (Android Emulator): triggered by user');
      void vscode.window.showInformationMessage(`Forwarding port ${port} to Android… Check Output → Saropa Drift Advisor.`);
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
        void vscode.window.showInformationMessage(`Port ${port} forwarded. Retrying discovery…`);
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
