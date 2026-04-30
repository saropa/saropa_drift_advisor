/**
 * VM Service connection and debug session lifecycle (Dart/Flutter).
 */

import * as vscode from 'vscode';
import type { IDebugCommandDeps } from './debug-commands-types';
import type { PerfBaselineStore } from './perf-baseline-store';
import type { PerformanceTreeProvider } from './performance-tree-provider';
import {
  detectRegressions,
  recordSessionBaselines,
  showRegressionWarning,
} from './perf-regression-detector';
import {
  getVmServiceUri,
  isValidVmServiceUri,
  registerVmServiceOutputListener,
} from '../vm-service-uri';
import { tryConnectVmInner } from './debug-vm-connect';
import { hideDvrStatusBar } from '../dvr/dvr-status-bar';

export interface IVmRegistrationOptions {
  perfProvider: PerformanceTreeProvider;
  baselineStore?: PerfBaselineStore;
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
    client,
    treeProvider,
    hoverCache,
    diagnosticManager,
    logBridge,
    discovery,
    serverManager,
    refreshStatusBar,
  } = deps;
  const { perfProvider, baselineStore, refreshInterval, logConnection } = options;

  let connectingVm = false;

  const tryConnectVm = async (
    session: vscode.DebugSession,
    vmUri: string,
    clearReported: (sessionId: string) => void,
  ): Promise<boolean> => {
    if (session.type !== 'dart' && session.type !== 'flutter') return false;
    if (client.usingVmService) return true;
    if (connectingVm) return false;

    if (!isValidVmServiceUri(vmUri)) {
      const msg = `VM Service URI invalid or missing; got length ${vmUri?.length ?? 0}`;
      logConnection(`VM Service: ${msg}`);
      logBridge.writeConnectionEvent(`VM Service: ${msg}`);
      return false;
    }

    connectingVm = true;
    try {
      const result = await tryConnectVmInner(
        vmUri,
        client,
        logConnection,
        (healthConfirmed) => {
          clearReported(session.id);
          if (healthConfirmed) {
            deps.refreshDriftConnectionUi?.();
            hoverCache.clear();
            perfProvider.stopAutoRefresh();
            diagnosticManager.clear();
            refreshStatusBar?.();
            treeProvider.refresh();
            logConnection(
              'VM Service disconnected (e.g. hot restart). '
                + 'Next URI from debug output will retry.',
            );
            logBridge.writeConnectionEvent(
              'VM Service disconnected (e.g. hot restart)',
            );
          }
        },
      );

      if (!result.success) {
        if (result.failureMessage) {
          logBridge.writeConnectionEvent(result.failureMessage);
        }
        return false;
      }

      deps.serverManager.adoptClientEndpointIfNone(client);
      deps.refreshDriftConnectionUi?.();
      await treeProvider.refresh();
      perfProvider.startAutoRefresh(client, refreshInterval);
      refreshStatusBar?.();
      const elapsed = result.elapsedMs ?? 0;
      logConnection(
        `Connected via VM Service (health ready after ~${elapsed}ms).`,
      );
      logBridge.writeConnectionEvent(
        'Connected to Drift debug server via VM Service',
      );
      return true;
    } finally {
      connectingVm = false;
    }
  };

  logConnection('VM Service handlers registered.');

  const vmListener = registerVmServiceOutputListener((session, wsUri) => {
    void tryConnectVm(session, wsUri, vmListener.clearReported);
  });
  vmListener.disposables.forEach((d) => context.subscriptions.push(d));

  const existingSession = vscode.debug.activeDebugSession;
  if (existingSession) {
    const t = existingSession.type;
    if (t === 'dart' || t === 'flutter') {
      logConnection(
        `Existing debug session found (${t}). Trying VM Service…`,
      );
      void (async () => {
        try {
          const vmUri = await getVmServiceUri(existingSession);
          if (vmUri) {
            await tryConnectVm(existingSession, vmUri, vmListener.clearReported);
          } else {
            logConnection(
              'VM Service URI not available for existing session.',
            );
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logConnection(`Existing session VM connect failed: ${msg}`);
        }
      })();
    }
  }

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
        serverManager.adoptClientEndpointIfNone(client);
        deps.refreshDriftConnectionUi?.();
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
      void client.dvrStop().catch(() => {
        /* DVR endpoint may be unavailable on disconnect. */
      });
      hideDvrStatusBar();
      client.setVmClient(null);
      deps.refreshDriftConnectionUi?.();
      hoverCache.clear();
      perfProvider.stopAutoRefresh();

      if (baselineStore) {
        const perfConfig = vscode.workspace.getConfiguration('driftViewer.perfRegression');
        const enabled = perfConfig.get<boolean>('enabled', true);
        if (enabled && perfProvider.data) {
          const threshold = perfConfig.get<number>('threshold', 2.0);
          const regressions = detectRegressions(perfProvider.data, baselineStore, threshold);
          showRegressionWarning(regressions);
          recordSessionBaselines(perfProvider.data, baselineStore);
        }
      }

      diagnosticManager.clear();
      refreshStatusBar?.();
      logBridge.writeConnectionEvent('Drift debug server disconnected');
    }),
  );

  context.subscriptions.push({
    dispose: () => perfProvider.stopAutoRefresh(),
  });
}
