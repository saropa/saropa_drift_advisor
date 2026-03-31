/**
 * Types and UI state building functions for server discovery.
 * Extracted from server-discovery-core to keep files under the line cap.
 */

// ---------------------------------------------------------------------------
// Types shared by discovery core and consumers.
// ---------------------------------------------------------------------------

export interface IServerInfo {
  host: string;
  port: number;
  firstSeen: number;
  lastSeen: number;
  missedPolls: number;
}

export interface IDiscoveryConfig {
  host: string;
  portRangeStart: number;
  portRangeEnd: number;
  additionalPorts?: number[];
  authHeaders?: Record<string, string>;
}

/** Optional hook when the user picks **Open URL** on the "server detected" toast (set via [setOnAfterOpenUrlFromNotification]). */
export type DiscoveryOpenUrlHook = (host: string, port: number) => void;

export type DiscoveryState = 'searching' | 'connected' | 'backoff';

export interface DiscoveryUiState {
  paused: boolean;
  state: DiscoveryState;
  host: string;
  portsLabel: string;
  activity: string;
  lastOutcome: string;
  nextScanInSec: number;
  scanInFlight: boolean;
  emptyScans: number;
  discoveredPorts: number[];
}

export interface IDiscoveryLog {
  appendLine(msg: string): void;
}

// ---------------------------------------------------------------------------
// Pure UI-state helpers (no side-effects).
// ---------------------------------------------------------------------------

/**
 * Human-readable label of the port range being scanned
 * (e.g. "8080–8090, also 9000").
 */
export function portsProbeLabel(config: IDiscoveryConfig): string {
  const { portRangeStart, portRangeEnd, additionalPorts } = config;
  let label = `${portRangeStart}–${portRangeEnd}`;
  if (additionalPorts?.length) {
    const extra = [...new Set(additionalPorts)].filter(
      (p) => p < portRangeStart || p > portRangeEnd,
    );
    if (extra.length) {
      extra.sort((a, b) => a - b);
      label += `, also ${extra.join(', ')}`;
    }
  }
  return label;
}

/**
 * Build the human-readable outcome line after a scan completes.
 * Returns the outcome string — the caller stores it in `_lastOutcomeLine`.
 */
export function scanOutcomeLine(
  alivePorts: number[],
  host: string,
  label: string,
): string {
  if (alivePorts.length > 0) {
    const ports = [...alivePorts].sort((a, b) => a - b);
    return `Last scan: Drift server validated on port(s) ${ports.join(', ')}.`;
  }
  return (
    `Last scan: no server on ${host} ports ${label}. `
    + 'Each candidate must return ok=true and a non-empty version from /api/health. '
    + 'If the app uses Bearer auth, set driftViewer.authToken to match.'
  );
}

/** Snapshot of discovery state needed by [buildDiscoveryUiState]. */
export interface DiscoverySnapshot {
  running: boolean;
  paused: boolean;
  state: DiscoveryState;
  host: string;
  portsLabel: string;
  emptyScans: number;
  servers: ReadonlyMap<number, IServerInfo>;
  lastOutcomeLine: string;
  /** Current poll interval in milliseconds. */
  intervalMs: number;
  scanInFlight: boolean;
}

/**
 * Build the [DiscoveryUiState] sent to the Schema Search webview.
 * Pure function — no side effects.
 */
export function buildDiscoveryUiState(snap: DiscoverySnapshot): DiscoveryUiState {
  const discoveredPorts = [...snap.servers.keys()].sort((a, b) => a - b);
  let activity: string;
  if (!snap.running) {
    activity = 'Discovery stopped (extension disabled or not started).';
  } else if (snap.paused) {
    activity = 'Paused — click Resume to scan again';
  } else if (snap.scanInFlight) {
    activity =
      `Scanning ${snap.host} ports ${snap.portsLabel} for a Drift debug server…`;
  } else {
    const sec = Math.max(1, Math.round(snap.intervalMs / 1000));
    if (snap.state === 'backoff') {
      activity =
        `Backoff after empty scans — next try in ${sec}s (then resumes faster scans).`;
    } else if (snap.state === 'connected') {
      activity =
        `Watching ${discoveredPorts.length} port(s) — next check in ${sec}s.`;
    } else {
      activity = `Searching — next port scan in ${sec}s.`;
    }
  }
  return {
    paused: snap.paused,
    state: snap.state,
    host: snap.host,
    portsLabel: snap.portsLabel,
    activity,
    lastOutcome: snap.lastOutcomeLine,
    nextScanInSec: !snap.running || snap.paused || snap.scanInFlight
      ? 0
      : Math.max(1, Math.round(snap.intervalMs / 1000)),
    scanInFlight: snap.scanInFlight,
    emptyScans: snap.emptyScans,
    discoveredPorts,
  };
}
