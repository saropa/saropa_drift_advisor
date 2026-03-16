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
import { VmServiceClient } from '../transport/vm-service-client';

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
    client, treeProvider, hoverCache, linter, logBridge,
    discovery, serverManager, refreshStatusBar,
  } = deps;
  const { perfProvider, baselineStore, refreshInterval, logConnection } = options;

  // Phase 1: WebSocket connect — quick retry (2 attempts, 500ms apart).
  const WS_CONNECT_ATTEMPTS = 2;
  const WS_CONNECT_RETRY_MS = 500;
  // Phase 2: Health check — patient retry while the app initialises and
  // registers ext.saropa.drift.* VM extensions. On an emulator, the app
  // may take 5-15s after the debug session starts to reach
  // DriftDebugServer.start(). Total wait: ~30s.
  const HEALTH_RETRY_DELAYS_MS = [
    500, 1000, 2000, 3000, 3000, 5000, 5000, 5000, 5000,
  ];

  // Guard against re-entrant calls while a connection attempt is in progress
  // (e.g. the VM output listener re-triggering while we are retrying health).
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
      return await _tryConnectVmInner(session, vmUri, clearReported);
    } finally {
      connectingVm = false;
    }
  };

  /** Inner implementation split out for readability; called by tryConnectVm. */
  const _tryConnectVmInner = async (
    session: vscode.DebugSession,
    vmUri: string,
    clearReported: (sessionId: string) => void,
  ): Promise<boolean> => {
    logConnection(
      `VM Service: connecting to ${vmUri.replace(/\/[^/]+\/?$/, '/…')}`,
    );

    // --- Phase 1: WebSocket connect ---
    // The VM service is auto-forwarded by Flutter, so the socket connects
    // quickly even on emulators. Two fast retries handle transient failures.
    let vmClient: VmServiceClient | undefined;
    // Track whether health check passed so the onClose handler knows whether
    // to perform full UI cleanup (only meaningful after successful connect).
    let healthConfirmed = false;

    for (let wsAttempt = 1; wsAttempt <= WS_CONNECT_ATTEMPTS; wsAttempt++) {
      try {
        vmClient = new VmServiceClient({
          wsUri: vmUri,
          onClose: () => {
            // Always allow the output listener to re-trigger on disconnect.
            clearReported(session.id);
            client.setVmClient(null);
            // Full UI cleanup only after a successful connection; during the
            // health-retry loop healthConfirmed is false and the cleanup below
            // would be premature.
            if (healthConfirmed) {
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
              logConnection(
                'VM Service disconnected (e.g. hot restart). '
                + 'Next URI from debug output will retry.',
              );
              logBridge.writeConnectionEvent(
                'VM Service disconnected (e.g. hot restart)',
              );
            }
          },
        });
        await vmClient.connect();
        break; // WebSocket connected successfully.
      } catch (err) {
        vmClient?.close();
        vmClient = undefined;
        const msg = err instanceof Error ? err.message : String(err);
        if (wsAttempt < WS_CONNECT_ATTEMPTS) {
          logConnection(
            `VM Service WebSocket attempt ${wsAttempt} failed: ${msg}. Retrying…`,
          );
          await new Promise((r) => setTimeout(r, WS_CONNECT_RETRY_MS));
        } else {
          logConnection(`VM Service WebSocket connect failed: ${msg}`);
          logBridge.writeConnectionEvent(
            `VM Service WebSocket connect failed: ${msg}`,
          );
          return false;
        }
      }
    }
    if (!vmClient) return false;

    // --- Phase 2: Wait for drift extensions to register ---
    // The ext.saropa.drift.getHealth method is only available after the app
    // calls DriftDebugServer.start(), which may take several seconds on an
    // emulator. Keep the WebSocket open and poll until health succeeds.
    client.setVmClient(vmClient);

    for (let i = 0; i <= HEALTH_RETRY_DELAYS_MS.length; i++) {
      try {
        await client.health();
        // Health check passed — the drift server is ready.
        healthConfirmed = true;
        vscode.commands.executeCommand(
          'setContext',
          'driftViewer.serverConnected',
          true,
        );
        await treeProvider.refresh();
        perfProvider.startAutoRefresh(client, refreshInterval);
        refreshStatusBar?.();
        const elapsed = HEALTH_RETRY_DELAYS_MS.slice(0, i).reduce(
          (a, b) => a + b,
          0,
        );
        logConnection(
          `Connected via VM Service (health ready after ~${elapsed}ms).`,
        );
        logBridge.writeConnectionEvent(
          'Connected to Drift debug server via VM Service',
        );
        return true;
      } catch {
        // Health not yet available — drift extensions probably not registered.
        if (i < HEALTH_RETRY_DELAYS_MS.length) {
          if (i === 0) {
            logConnection(
              'VM Service connected. Waiting for drift extensions '
              + 'to register (app still initialising)…',
            );
          }
          await new Promise((r) => setTimeout(r, HEALTH_RETRY_DELAYS_MS[i]));
          // Bail out if the WebSocket closed while we were waiting (e.g. the
          // user stopped the app or a hot restart happened).
          if (!vmClient.connected) {
            logConnection(
              'VM Service WebSocket closed while waiting for drift extensions.',
            );
            client.setVmClient(null);
            return false;
          }
        } else {
          // Exhausted all retries.
          const totalWait =
            HEALTH_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0) / 1000;
          logConnection(
            `Drift extensions not available after ~${totalWait}s. `
            + 'Ensure the app calls DriftDebugServer.start().',
          );
          logBridge.writeConnectionEvent(
            `VM Service: drift extensions not available after ~${totalWait}s`,
          );
          vmClient.close();
          client.setVmClient(null);
          return false;
        }
      }
    }
    return false;
  };

  logConnection('VM Service handlers registered.');

  const vmListener = registerVmServiceOutputListener((session, wsUri) => {
    void tryConnectVm(session, wsUri, vmListener.clearReported);
  });
  vmListener.disposables.forEach((d) => context.subscriptions.push(d));

  // If a Dart/Flutter debug session is already active (extension activated
  // late, or reloaded during a session), try connecting immediately instead
  // of waiting for the next onDidStartDebugSession event.
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

      linter.clear();
      refreshStatusBar?.();
      logBridge.writeConnectionEvent('Drift debug server disconnected');
    }),
  );

  context.subscriptions.push({
    dispose: () => perfProvider.stopAutoRefresh(),
  });
}
