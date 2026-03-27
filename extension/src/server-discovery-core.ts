/**
 * Discovers Drift debug servers by scanning a port range and validates
 * the lightweight `/api/health` payload. Emits server list changes and notifications.
 */
import * as vscode from 'vscode';
import {
  BACKOFF_CYCLES,
  BACKOFF_INTERVAL,
  BACKOFF_THRESHOLD,
  CONNECTED_INTERVAL,
  MISS_THRESHOLD,
  NOTIFY_THROTTLE_MS,
  SEARCH_INTERVAL,
} from './server-discovery-constants';
import { maybeNotifyServerEvent } from './server-discovery-notify';
import { scanPorts } from './server-discovery-scan';

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
export class ServerDiscovery {
  private readonly _onDidChangeServers = new vscode.EventEmitter<IServerInfo[]>();
  readonly onDidChangeServers = this._onDidChangeServers.event;
  private readonly _onDidChangeDiscoveryUi = new vscode.EventEmitter<DiscoveryUiState>();
  readonly onDidChangeDiscoveryUi = this._onDidChangeDiscoveryUi.event;
  private readonly _config: IDiscoveryConfig;
  private _authHeaders: Record<string, string> | undefined;
  private _servers = new Map<number, IServerInfo>();
  private _state: DiscoveryState = 'searching';
  private _emptyScans = 0;
  private _backoffPolls = 0;
  private _running = false;
  private _paused = false;
  private _pollId = 0;
  private _pollTimeout: ReturnType<typeof setTimeout> | undefined;
  private _notifiedAt = new Map<number, number>();
  private _log: IDiscoveryLog | undefined;
  private _lastOutcomeLine =
    'Discovery starting — watch this panel for scan progress.';
  constructor(config: IDiscoveryConfig) {
    this._config = config;
    this._authHeaders = config.authHeaders;
  }
  setAuthHeaders(headers: Record<string, string> | undefined): void {
    this._authHeaders = headers;
  }
  setLog(log: IDiscoveryLog): void {
    this._log = log;
  }
  private _logLine(msg: string): void {
    this._log?.appendLine(`[${new Date().toISOString()}] Discovery: ${msg}`);
  }
  get state(): DiscoveryState {
    return this._state;
  }
  get servers(): IServerInfo[] {
    return [...this._servers.values()];
  }
  get isPaused(): boolean {
    return this._paused;
  }
  getDiscoverySnapshot(): DiscoveryUiState {
    return this._buildDiscoveryUiState(false);
  }
  start(): void {
    if (this._running) return;
    this._running = true;
    this._emitDiscoveryUi(false);
    void this._poll(this._pollId);
  }
  stop(): void {
    this._running = false;
    this._paused = false;
    this._pollId++;
    if (this._pollTimeout !== undefined) {
      clearTimeout(this._pollTimeout);
      this._pollTimeout = undefined;
    }
  }
  pause(): void {
    if (!this._running || this._paused) return;
    this._paused = true;
    if (this._pollTimeout !== undefined) {
      clearTimeout(this._pollTimeout);
      this._pollTimeout = undefined;
    }
    this._logLine('Paused — discovery scans stopped until Resume');
    this._emitDiscoveryUi(false);
  }
  resume(): void {
    if (!this._running || !this._paused) return;
    this._paused = false;
    this._logLine('Resumed — scanning now');
    this._emitDiscoveryUi(false);
    void this._poll(this._pollId);
  }
  retry(): void {
    this._logLine('Retry requested — resetting to searching state');
    this._paused = false;
    this.stop();
    this._state = 'searching';
    this._emptyScans = 0;
    this.start();
  }
  dispose(): void {
    this.stop();
    this._onDidChangeServers.dispose();
    this._onDidChangeDiscoveryUi.dispose();
  }
  private _portsProbeLabel(): string {
    const { portRangeStart, portRangeEnd, additionalPorts } = this._config;
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
  private _recordScanOutcome(alivePorts: number[]): void {
    if (alivePorts.length > 0) {
      const ports = [...alivePorts].sort((a, b) => a - b);
      this._lastOutcomeLine =
        `Last scan: Drift server validated on port(s) ${ports.join(', ')}.`;
    } else {
      this._lastOutcomeLine =
        `Last scan: no server on ${this._config.host} ports ${this._portsProbeLabel()}. `
        + 'Each candidate must return ok=true and a non-empty version from /api/health. '
        + 'If the app uses Bearer auth, set driftViewer.authToken to match.';
    }
  }
  private _buildDiscoveryUiState(scanInFlight: boolean): DiscoveryUiState {
    const portsLabel = this._portsProbeLabel();
    const discoveredPorts = [...this._servers.keys()].sort((a, b) => a - b);
    let activity: string;
    if (!this._running) {
      activity = 'Discovery stopped (extension disabled or not started).';
    } else if (this._paused) {
      activity = 'Paused — click Resume to scan again';
    } else if (scanInFlight) {
      activity =
        `Scanning ${this._config.host} ports ${portsLabel} for a Drift debug server…`;
    } else {
      const sec = Math.max(1, Math.round(this._getInterval() / 1000));
      if (this._state === 'backoff') {
        activity =
          `Backoff after empty scans — next try in ${sec}s (then resumes faster scans).`;
      } else if (this._state === 'connected') {
        activity =
          `Watching ${discoveredPorts.length} port(s) — next check in ${sec}s.`;
      } else {
        activity = `Searching — next port scan in ${sec}s.`;
      }
    }
    return {
      paused: this._paused,
      state: this._state,
      host: this._config.host,
      portsLabel,
      activity,
      lastOutcome: this._lastOutcomeLine,
      nextScanInSec: !this._running || this._paused || scanInFlight
        ? 0
        : Math.max(1, Math.round(this._getInterval() / 1000)),
      scanInFlight,
      emptyScans: this._emptyScans,
      discoveredPorts,
    };
  }
  private _emitDiscoveryUi(scanInFlight: boolean): void {
    this._onDidChangeDiscoveryUi.fire(this._buildDiscoveryUiState(scanInFlight));
  }
  private async _poll(id: number): Promise<void> {
    if (!this._running || id !== this._pollId) return;
    if (this._paused) {
      this._emitDiscoveryUi(false);
      return;
    }
    this._emitDiscoveryUi(true);
    try {
      const alivePorts = await scanPorts(
        {
          host: this._config.host,
          portRangeStart: this._config.portRangeStart,
          portRangeEnd: this._config.portRangeEnd,
          additionalPorts: this._config.additionalPorts,
          authHeaders: this._authHeaders,
        },
        (msg) => this._logLine(msg),
      );
      if (!this._running || id !== this._pollId) return;
      this._recordScanOutcome(alivePorts);
      this._updateServers(alivePorts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._logLine(`Port scan failed: ${msg}`);
      if (!this._running || id !== this._pollId) return;
      this._lastOutcomeLine = `Last scan failed: ${msg}`;
      this._updateServers([]);
    }
    this._emitDiscoveryUi(false);
    if (this._running && id === this._pollId) {
      if (this._paused) return;
      this._pollTimeout = setTimeout(
        () => this._poll(id),
        this._getInterval(),
      );
    }
  }
  private _updateServers(alivePorts: number[]): void {
    const now = Date.now();
    const aliveSet = new Set(alivePorts);
    let changed = false;
    for (const port of alivePorts) {
      const existing = this._servers.get(port);
      if (existing) {
        existing.lastSeen = now;
        existing.missedPolls = 0;
      } else {
        this._servers.set(port, {
          host: this._config.host,
          port,
          firstSeen: now,
          lastSeen: now,
          missedPolls: 0,
        });
        maybeNotifyServerEvent(
          this._config.host,
          port,
          'found',
          this._notifiedAt,
          NOTIFY_THROTTLE_MS,
        );
        changed = true;
      }
    }
    for (const [port, info] of this._servers) {
      if (!aliveSet.has(port)) {
        info.missedPolls++;
        if (info.missedPolls >= MISS_THRESHOLD) {
          this._servers.delete(port);
          maybeNotifyServerEvent(
            this._config.host,
            port,
            'lost',
            this._notifiedAt,
            NOTIFY_THROTTLE_MS,
          );
          changed = true;
        }
      }
    }
    const prevState = this._state;
    if (this._servers.size > 0) {
      this._state = 'connected';
      this._emptyScans = 0;
      this._backoffPolls = 0;
    } else if (alivePorts.length === 0) {
      this._emptyScans++;
      if (this._state === 'backoff') {
        this._backoffPolls++;
        if (this._backoffPolls >= BACKOFF_CYCLES) {
          this._state = 'searching';
          this._emptyScans = 0;
          this._backoffPolls = 0;
        }
      } else {
        this._state =
          this._emptyScans >= BACKOFF_THRESHOLD ? 'backoff' : 'searching';
      }
    }
    if (this._state !== prevState) {
      this._logLine(
        `State: ${prevState} → ${this._state} (empty scans: ${this._emptyScans})`,
      );
    }
    if (changed || this._state !== prevState) {
      this._onDidChangeServers.fire(this.servers);
    }
  }
  private _getInterval(): number {
    switch (this._state) {
      case 'searching':
        return SEARCH_INTERVAL;
      case 'connected':
        return CONNECTED_INTERVAL;
      case 'backoff':
        return BACKOFF_INTERVAL;
    }
  }
}
