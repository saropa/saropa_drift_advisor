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
import type { IServerInfo, IDiscoveryConfig, DiscoveryOpenUrlHook, DiscoveryState, DiscoveryUiState, IDiscoveryLog } from './server-discovery-ui-state';
import { portsProbeLabel, scanOutcomeLine, buildDiscoveryUiState } from './server-discovery-ui-state';
export type { IServerInfo, IDiscoveryConfig, DiscoveryOpenUrlHook, DiscoveryState, DiscoveryUiState, IDiscoveryLog } from './server-discovery-ui-state';
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
  private _scanCount = 0;
  private _lastOutcomeLine =
    'Discovery starting — watch this panel for scan progress.';
  /** Passed to [maybeNotifyServerEvent] so “Open URL” selects this server in the extension. */
  private _onAfterOpenUrlFromNotification: DiscoveryOpenUrlHook | undefined;
  constructor(config: IDiscoveryConfig) {
    this._config = config;
    this._authHeaders = config.authHeaders;
  }
  /**
   * Call after [ServerManager] exists so the discovery toast’s **Open URL** adopts that host:port
   * as the active server (aligns sidebar/API with the browser the user just opened).
   */
  setOnAfterOpenUrlFromNotification(fn: DiscoveryOpenUrlHook | undefined): void {
    this._onAfterOpenUrlFromNotification = fn;
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
    return buildDiscoveryUiState(this._snapshot(false));
  }
  start(): void {
    if (this._running) return;
    this._running = true;
    this._scanCount = 0;
    this._logLine(
      `Starting — scanning ${this._config.host} ports ${portsProbeLabel(this._config)} `
      + `every ${SEARCH_INTERVAL / 1000}s (backoff after ${BACKOFF_THRESHOLD} empty scans to ${BACKOFF_INTERVAL / 1000}s)`,
    );
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
  /** Build a [DiscoverySnapshot] for the pure [buildDiscoveryUiState] helper. */
  private _snapshot(scanInFlight: boolean) {
    return {
      running: this._running,
      paused: this._paused,
      state: this._state,
      host: this._config.host,
      portsLabel: portsProbeLabel(this._config),
      emptyScans: this._emptyScans,
      servers: this._servers,
      lastOutcomeLine: this._lastOutcomeLine,
      intervalMs: this._getInterval(),
      scanInFlight,
    };
  }
  private _emitDiscoveryUi(scanInFlight: boolean): void {
    this._onDidChangeDiscoveryUi.fire(buildDiscoveryUiState(this._snapshot(scanInFlight)));
  }
  private async _poll(id: number): Promise<void> {
    if (!this._running || id !== this._pollId) return;
    if (this._paused) {
      this._emitDiscoveryUi(false);
      return;
    }
    this._scanCount++;
    const scanNum = this._scanCount;
    const portsLabel = portsProbeLabel(this._config);
    this._logLine(
      `Scan #${scanNum} starting — ${this._config.host} ports ${portsLabel} [state=${this._state}]`,
    );
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
      // Log every scan result — not just found servers — so the user can see
      // progress during long periods of no server.
      if (alivePorts.length > 0) {
        this._logLine(
          `Scan #${scanNum} complete — server(s) on port(s): ${alivePorts.join(', ')}`,
        );
      } else {
        this._logLine(
          `Scan #${scanNum} complete — no server found (empty scans so far: ${this._emptyScans + 1})`,
        );
      }
      this._lastOutcomeLine = scanOutcomeLine(
        alivePorts, this._config.host, portsProbeLabel(this._config),
      );
      this._updateServers(alivePorts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._logLine(`Scan #${scanNum} failed: ${msg}`);
      if (!this._running || id !== this._pollId) return;
      this._lastOutcomeLine = `Last scan failed: ${msg}`;
      this._updateServers([]);
    }
    this._emitDiscoveryUi(false);
    if (this._running && id === this._pollId) {
      if (this._paused) return;
      const interval = this._getInterval();
      this._logLine(
        `Next scan in ${interval / 1000}s [state=${this._state}, empty=${this._emptyScans}]`,
      );
      this._pollTimeout = setTimeout(
        () => this._poll(id),
        interval,
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
          this._onAfterOpenUrlFromNotification,
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
