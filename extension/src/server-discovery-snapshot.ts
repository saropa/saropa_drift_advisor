/**
 * Discovery state snapshot builder for UI/debugging.
 */
import { pollIntervalForState } from './server-discovery-state-machine';
import { portsProbeLabel, buildDiscoveryUiState } from './server-discovery-ui-state';
import type { DiscoveryState, IServerInfo, IDiscoveryConfig, DiscoveryUiState } from './server-discovery-ui-state';

export interface DiscoverySnapshot {
  running: boolean;
  paused: boolean;
  state: DiscoveryState;
  host: string;
  portsLabel: string;
  emptyScans: number;
  servers: Map<number, IServerInfo>;
  lastOutcomeLine: string;
  intervalMs: number;
  scanInFlight: boolean;
}

/**
 * Builds a snapshot of current discovery state for UI and debugging.
 */
export function buildSnapshot(
  running: boolean,
  paused: boolean,
  state: DiscoveryState,
  config: IDiscoveryConfig,
  emptyScans: number,
  servers: Map<number, IServerInfo>,
  lastOutcomeLine: string,
  scanInFlight: boolean,
): DiscoverySnapshot {
  return {
    running,
    paused,
    state,
    host: config.host,
    portsLabel: portsProbeLabel(config),
    emptyScans,
    servers,
    lastOutcomeLine,
    intervalMs: pollIntervalForState(state),
    scanInFlight,
  };
}

/**
 * Builds the UI-facing discovery state from a snapshot.
 */
export function snapshotToUiState(snapshot: DiscoverySnapshot): DiscoveryUiState {
  return buildDiscoveryUiState(snapshot);
}
