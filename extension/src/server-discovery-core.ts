/**
 * Discovers Drift debug servers by scanning a port range and validates
 * the lightweight `/api/health` payload. Emits server list changes and notifications.
 */
import * as vscode from 'vscode';
import {
  BACKOFF_INTERVAL,
  BACKOFF_THRESHOLD,
  LOST_NOTIFY_GRACE_MS,
  SEARCH_INTERVAL,
} from './server-discovery-constants';
import { ServerLostDebouncer } from './server-discovery-lost-debounce';
import { maybeNotifyServerEvent } from './server-discovery-notify';
import { scanPorts } from './server-discovery-scan';
import { pollIntervalForState } from './server-discovery-state-machine';
import { updateServersFromScan } from './server-discovery-state-updater';
import { buildSnapshot, snapshotToUiState } from './server-discovery-snapshot';
import { portsProbeLabel, scanOutcomeLine } from './server-discovery-ui-state';
import { getGlobalCircuitBreaker } from './transport/circuit-breaker';
import type { IServerInfo, IDiscoveryConfig, DiscoveryOpenUrlHook, DiscoveryState, DiscoveryUiState, IDiscoveryLog } from './server-discovery-ui-state';
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
  /**
   * Defers and collapses "server lost" toasts so a flaky link that flaps
   * produces a single warning at most. State/sidebar updates are unaffected —
   * see [ServerLostDebouncer]. Re-armed each [start].
   */
  private readonly _lostDebouncer = new ServerLostDebouncer({
    isRunning: () => this._running,
    graceMs: LOST_NOTIFY_GRACE_MS,
    // Bypass the per-port throttle (pass 0): the debouncer's session latch
    // already caps this to once per session, and the shared throttle map would
    // otherwise let a recent "detected" toast suppress the one warning we want.
    notifyLost: (port) =>
      maybeNotifyServerEvent(this._config.host, port, 'lost', this._notifiedAt, 0),
  });
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
    return snapshotToUiState(
      buildSnapshot(
        this._running,
        this._paused,
        this._state,
        this._config,
        this._emptyScans,
        this._servers,
        this._lastOutcomeLine,
        false,
      ),
    );
  }
  /**
   * @param reArmLostLatch — When true (a genuinely fresh session: extension
   *   activate, user "Retry Discovery"), re-arm the once-per-session "lost"
   *   warning so the next discovery announces. When false (an internal restart
   *   from [retry] on the automatic adb-forward recovery path), preserve the
   *   latch: a wireless link that flaps and re-forwards is the same session the
   *   user already asked not to be re-notified about.
   */
  start(reArmLostLatch = true): void {
    if (this._running) return;
    this._running = true;
    this._scanCount = 0;
    // A fresh discovery session re-arms the once-per-session "lost" warning; an
    // internal auto-recovery restart (reArmLostLatch=false) keeps it latched so
    // the per-reconnect "detected" toast stays suppressed on a flaky link.
    if (reArmLostLatch) this._lostDebouncer.reset();
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
    this._lostDebouncer.clearAll();
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
  /**
   * Restart discovery in the fast "searching" state.
   * @param options.resetNotifyLatch — Default true: a user-initiated retry
   *   re-arms the once-per-session toast so the next discovery re-announces.
   *   Pass false on the automatic adb-forward recovery path so a flapping
   *   wireless link does not re-fire a "detected" toast on every reconnect
   *   (the latch survives [stop]; only [start]'s re-arm is skipped).
   */
  retry(options: { resetNotifyLatch?: boolean } = {}): void {
    const resetNotifyLatch = options.resetNotifyLatch ?? true;
    this._logLine(
      `Retry requested — resetting to searching state`
      + `${resetNotifyLatch ? '' : ' (preserving notify latch — auto-recovery)'}`,
    );
    this._paused = false;
    this.stop();
    this._state = 'searching';
    this._emptyScans = 0;
    // User-initiated retry resets the circuit breaker so suppressed requests
    // resume immediately instead of waiting for the cooldown to elapse.
    getGlobalCircuitBreaker()?.reset();
    this.start(resetNotifyLatch);
  }
  dispose(): void {
    this.stop();
    this._onDidChangeServers.dispose();
    this._onDidChangeDiscoveryUi.dispose();
  }
  private _emitDiscoveryUi(scanInFlight: boolean): void {
    this._onDidChangeDiscoveryUi.fire(
      snapshotToUiState(
        buildSnapshot(
          this._running,
          this._paused,
          this._state,
          this._config,
          this._emptyScans,
          this._servers,
          this._lastOutcomeLine,
          scanInFlight,
        ),
      ),
    );
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
      const interval = pollIntervalForState(this._state);
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
    const result = updateServersFromScan(
      {
        state: this._state,
        emptyScans: this._emptyScans,
        backoffPolls: this._backoffPolls,
        servers: this._servers,
      },
      alivePorts,
      this._config,
      this._lostDebouncer,
      this._notifiedAt,
      this._onAfterOpenUrlFromNotification,
      (msg) => this._logLine(msg),
    );
    // Reassign the tracked map BEFORE firing so any listener that reads back
    // `this.servers` (the getter) sees the newly-added/removed servers, not the
    // pre-scan copy. The updater returns [changed] rather than firing itself
    // precisely so this ordering is under the core's control (a regression where
    // the event fired the stale list broke first-scan auto-connect).
    this._state = result.nextState.state;
    this._emptyScans = result.nextState.emptyScans;
    this._backoffPolls = result.nextState.backoffPolls;
    this._servers = result.nextState.servers;
    if (result.changed) {
      this._onDidChangeServers.fire(this.servers);
    }
  }
}
