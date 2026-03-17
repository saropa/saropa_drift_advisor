/**
 * VM Service connection flow: WebSocket connect then health retry until
 * drift extensions are registered. Used by debug-commands-vm.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import { VmServiceClient } from '../transport/vm-service-client';

/** Phase 1: WebSocket connect — quick retry (2 attempts, 500ms apart). */
export const WS_CONNECT_ATTEMPTS = 2;
export const WS_CONNECT_RETRY_MS = 500;

/**
 * Phase 2: Health check — patient retry while the app initialises and
 * registers ext.saropa.drift.* VM extensions. On an emulator, the app
 * may take 5-15s after the debug session starts to reach DriftDebugServer.start().
 * Total wait: ~30s.
 */
export const HEALTH_RETRY_DELAYS_MS = [
  500, 1000, 2000, 3000, 3000, 5000, 5000, 5000, 5000,
];

export interface ConnectVmResult {
  success: boolean;
  healthConfirmed: boolean;
  /** When success, approximate ms until health passed (for logging). */
  elapsedMs?: number;
  /** When !success: 'ws' = WebSocket connect failed, 'health' = extensions not available. */
  failureKind?: 'ws' | 'health';
  /** When !success, message already passed to logConnection (for logBridge). */
  failureMessage?: string;
}

/**
 * Attempt WebSocket connect then poll health until drift extensions are ready.
 * On success, client will already have setVmClient(vmClient). When the socket
 * closes, onClose(healthConfirmed) is called so the caller can run UI cleanup
 * only when a connection had previously succeeded.
 */
export async function tryConnectVmInner(
  vmUri: string,
  client: DriftApiClient,
  logConnection: (msg: string) => void,
  onClose: (healthConfirmed: boolean) => void,
): Promise<ConnectVmResult> {
  logConnection(
    `VM Service: connecting to ${vmUri.replace(/\/[^/]+\/?$/, '/…')}`,
  );

  let vmClient: VmServiceClient | undefined;
  let healthConfirmed = false;

  const handleSocketClose = (): void => {
    client.setVmClient(null);
    onClose(healthConfirmed);
  };

  for (let wsAttempt = 1; wsAttempt <= WS_CONNECT_ATTEMPTS; wsAttempt++) {
    try {
      vmClient = new VmServiceClient({
        wsUri: vmUri,
        onClose: handleSocketClose,
      });
      await vmClient.connect();
      break;
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
        return {
          success: false,
          healthConfirmed: false,
          failureKind: 'ws',
          failureMessage: `VM Service WebSocket connect failed: ${msg}`,
        };
      }
    }
  }
  if (!vmClient) {
    return { success: false, healthConfirmed: false, failureKind: 'ws' };
  }

  client.setVmClient(vmClient);

  for (let i = 0; i <= HEALTH_RETRY_DELAYS_MS.length; i++) {
    try {
      await client.health();
      healthConfirmed = true;
      const elapsedMs = HEALTH_RETRY_DELAYS_MS.slice(0, i).reduce((a, b) => a + b, 0);
      return { success: true, healthConfirmed: true, elapsedMs };
    } catch {
      if (i < HEALTH_RETRY_DELAYS_MS.length) {
        if (i === 0) {
          logConnection(
            'VM Service connected. Waiting for drift extensions '
              + 'to register (app still initialising)…',
          );
        }
        await new Promise((r) => setTimeout(r, HEALTH_RETRY_DELAYS_MS[i]));
        if (!vmClient.connected) {
          logConnection(
            'VM Service WebSocket closed while waiting for drift extensions.',
          );
          client.setVmClient(null);
          return {
            success: false,
            healthConfirmed: false,
            failureKind: 'ws',
            failureMessage: 'VM Service WebSocket closed while waiting for drift extensions',
          };
        }
      } else {
        const totalWait =
          HEALTH_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0) / 1000;
        const msg = `Drift extensions not available after ~${totalWait}s. Ensure the app calls DriftDebugServer.start().`;
        logConnection(msg);
        vmClient.close();
        client.setVmClient(null);
        return {
          success: false,
          healthConfirmed: false,
          failureKind: 'health',
          failureMessage: `VM Service: drift extensions not available after ~${totalWait}s`,
        };
      }
    }
  }
  // Defensive fallthrough (loop always returns in practice).
  return { success: false, healthConfirmed: false, failureKind: 'health' };
}
