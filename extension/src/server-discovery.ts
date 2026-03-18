/**
 * Discovers Drift debug servers by scanning a port range and validates
 * health + schema metadata. Emits server list changes and optional notifications.
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

/** Discovered server info. */
export interface IServerInfo {
  host: string;
  port: number;
  firstSeen: number;
  lastSeen: number;
  missedPolls: number;
}

/** Configuration for server discovery. */
export interface IDiscoveryConfig {
  host: string;
  portRangeStart: number;
  portRangeEnd: number;
  /** Extra ports to include in scans (e.g., last-known ports from workspace state). */
  additionalPorts?: number[];
}

/** Polling state machine states. */
export type DiscoveryState = 'searching' | 'connected' | 'backoff';

/** Optional log sink for discovery diagnostics. */
export interface IDiscoveryLog {
  appendLine(msg: string): void;
}

/** Scans a port range for running Drift debug servers. */
export class ServerDiscovery {
  private readonly _onDidChangeServers = new vscode.EventEmitter<IServerInfo[]>();
  readonly onDidChangeServers = this._onDidChangeServers.event;

  private readonly _config: IDiscoveryConfig;
  private _servers = new Map<number, IServerInfo>();
  private _state: DiscoveryState = 'searching';
  private _emptyScans = 0;
  private _backoffPolls = 0;
  private _running = false;
  private _pollId = 0;
  private _pollTimeout: ReturnType<typeof setTimeout> | undefined;
  private _notifiedAt = new Map<number, number>();
  private _log: IDiscoveryLog | undefined;

  constructor(config: IDiscoveryConfig) {
    this._config = config;
  }

  /** Attach a log sink (e.g. OutputChannel) for connection diagnostics. */
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

  start(): void {
    if (this._running) return;
    this._running = true;
    this._poll(this._pollId);
  }

  stop(): void {
    this._running = false;
    this._pollId++;
    if (this._pollTimeout !== undefined) {
      clearTimeout(this._pollTimeout);
      this._pollTimeout = undefined;
    }
  }

  /** Force immediate re-scan from searching state. */
  retry(): void {
    this._logLine('Retry requested — resetting to searching state');
    this.stop();
    this._state = 'searching';
    this._emptyScans = 0;
    this.start();
  }

  dispose(): void {
    this.stop();
    this._onDidChangeServers.dispose();
  }

  private async _poll(id: number): Promise<void> {
    if (!this._running || id !== this._pollId) return;

    try {
      const alivePorts = await scanPorts(this._config, (msg) => this._logLine(msg));
      if (!this._running || id !== this._pollId) return;
      this._updateServers(alivePorts);
    } catch (err) {
      // Log the scan failure so it shows in the Output channel instead of silently vanishing
      const msg = err instanceof Error ? err.message : String(err);
      this._logLine(`Port scan failed: ${msg}`);
      if (!this._running || id !== this._pollId) return;
      this._updateServers([]);
    }

    if (this._running && id === this._pollId) {
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
