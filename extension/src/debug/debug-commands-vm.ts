/**
 * VM Service connection and debug session lifecycle (Dart/Flutter).
 */

import * as vscode from 'vscode';
import type { IDebugCommandDeps } from './debug-commands-types';
import type { PerformanceTreeProvider } from './performance-tree-provider';
import {
  getVmServiceUri,
  isValidVmServiceUri,
  registerVmServiceOutputListener,
} from '../vm-service-uri';
import { VmServiceClient } from '../transport/vm-service-client';

export interface IVmRegistrationOptions {
  perfProvider: PerformanceTreeProvider;
  refreshInterval: number;
  logConnection: (msg: string) => void;
}

/**
 * Register VM Service output listener and debug session start/terminate handlers.
 */
export function registerDebugCommandsVm(
  context: vscode.ExtensionContext,
  deps: IDebugCommandDeps,
  options: IVmRegistrationOptions,
): void {
  const {
    client, treeProvider, hoverCache, linter, logBridge,
    discovery, serverManager, refreshStatusBar,
  } = deps;
  const { perfProvider, refreshInterval, logConnection } = options;

  const tryConnectVm = async (
    session: vscode.DebugSession,
    vmUri: string,
    clearReported: (sessionId: string) => void,
  ): Promise<boolean> => {
    if (session.type !== 'dart' && session.type !== 'flutter') return false;
    if (client.usingVmService) return true;

    if (!isValidVmServiceUri(vmUri)) {
      const msg = `VM Service URI invalid or missing; got length ${vmUri?.length ?? 0}`;
      logConnection(`VM Service: ${msg}`);
      logBridge.writeConnectionEvent(`VM Service: ${msg}`);
      return false;
    }

    logConnection(`VM Service: connecting to ${vmUri.replace(/\/[^/]+\/?$/, '/…')}`);

    try {
      const vmClient = new VmServiceClient({
        wsUri: vmUri,
        onClose: () => {
          clearReported(session.id);
          client.setVmClient(null);
          vscode.commands.executeCommand(
            'setContext',
            'driftViewer.serverConnected',
            false,
          );
          hoverCache.clear();
          perfProvider.stopAutoRefresh();
          linter.clear();
          refreshStatusBar?.();
          treeProvider.refresh();
          logConnection('VM Service disconnected (e.g. hot restart). Next URI from debug output will retry.');
          logBridge.writeConnectionEvent('VM Service disconnected (e.g. hot restart)');
        },
      });
      await vmClient.connect();
      client.setVmClient(vmClient);
      await client.health();
      vscode.commands.executeCommand(
        'setContext',
        'driftViewer.serverConnected',
        true,
      );
      await treeProvider.refresh();
      perfProvider.startAutoRefresh(client, refreshInterval);
      refreshStatusBar?.();
      logConnection('Connected via VM Service.');
      logBridge.writeConnectionEvent(
        'Connected to Drift debug server via VM Service',
      );
      return true;
    } catch (err) {
      client.setVmClient(null);
      const message = err instanceof Error ? err.message : String(err);
      logConnection(`VM Service connection failed: ${message}`);
      logBridge.writeConnectionEvent(`VM Service connection failed: ${message}`);
      return false;
    }
  };

  const vmListener = registerVmServiceOutputListener((session, wsUri) => {
    void tryConnectVm(session, wsUri, vmListener.clearReported);
  });
  vmListener.disposables.forEach((d) => context.subscriptions.push(d));

  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession(async (session) => {
      if (session.type !== 'dart' && session.type !== 'flutter') return;
      logConnection(`Debug session started (${session.type}). Trying VM Service…`);
      hoverCache.clear();
      const vmUri = await getVmServiceUri(session);
      if (vmUri && (await tryConnectVm(session, vmUri, vmListener.clearReported))) return;
      if (!vmUri) {
        logConnection('VM Service URI not available from adapter; will try from debug output if it appears.');
      }
      if (!serverManager.activeServer) discovery.retry();
      try {
        await client.health();
        vscode.commands.executeCommand(
          'setContext',
          'driftViewer.serverConnected',
          true,
        );
        perfProvider.startAutoRefresh(client, refreshInterval);
        logConnection(`Connected via HTTP at ${client.baseUrl}`);
        logBridge.writeConnectionEvent(
          `Connected to Drift debug server at ${client.baseUrl}`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logConnection(`HTTP connection failed: ${message}. Ensure app calls DriftDebugServer.start() and port is correct.`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.debug.onDidTerminateDebugSession((session) => {
      if (session.type !== 'dart' && session.type !== 'flutter') return;
      logConnection('Debug session ended. Drift disconnected.');
      client.setVmClient(null);
      vscode.commands.executeCommand(
        'setContext',
        'driftViewer.serverConnected',
        false,
      );
      hoverCache.clear();
      perfProvider.stopAutoRefresh();
      linter.clear();
      refreshStatusBar?.();
      logBridge.writeConnectionEvent('Drift debug server disconnected');
    }),
  );

  context.subscriptions.push({
    dispose: () => perfProvider.stopAutoRefresh(),
  });
}
