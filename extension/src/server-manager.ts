/**
 * Active server selection, client host/port updates, and workspace port memory.
 */

import * as vscode from 'vscode';
import { DriftApiClient } from './api-client';
import { IServerInfo, ServerDiscovery } from './server-discovery';

const WORKSPACE_KEY = 'driftViewer.lastKnownPorts';

/** Manages active server selection, client reconfiguration, and persistence. */
export class ServerManager {
  private readonly _onDidChangeActive = new vscode.EventEmitter<IServerInfo | undefined>();
  readonly onDidChangeActive = this._onDidChangeActive.event;

  private _activeServer: IServerInfo | undefined;
  private _picking = false; // Guards against concurrent QuickPick dialogs
  private readonly _discovery: ServerDiscovery;
  private readonly _client: DriftApiClient;
  private readonly _workspaceState: vscode.Memento;
  private readonly _disposable: vscode.Disposable;
  private _showLog?: () => void;
  private _log?: (msg: string) => void;

  constructor(
    discovery: ServerDiscovery,
    client: DriftApiClient,
    workspaceState: vscode.Memento,
  ) {
    this._discovery = discovery;
    this._client = client;
    this._workspaceState = workspaceState;
    this._disposable = discovery.onDidChangeServers((servers) =>
      this._onServersChanged(servers),
    );
  }

  /** Set callback to show the connection log (e.g. OutputChannel.show). */
  setShowLog(fn: () => void): void {
    this._showLog = fn;
  }

  /** Optional log sink for connection events (e.g. when auto-selecting a server). */
  setLog(log: (msg: string) => void): void {
    this._log = log;
  }

  get activeServer(): IServerInfo | undefined {
    return this._activeServer;
  }

  get servers(): IServerInfo[] {
    return this._discovery.servers;
  }

  /** Clear the active server and notify (e.g. when extension is disabled). */
  clearActive(): void {
    if (this._activeServer !== undefined) {
      this._setActive(undefined);
    }
  }

  /**
   * Select the server matching [host] and [port] from the current discovery list.
   * Used when the user chooses **Open URL** on the “server detected” notification so the
   * extension uses the same endpoint as the browser (especially after dismissing multi-server QuickPick).
   */
  ensureActiveForDiscoveredPort(host: string, port: number): void {
    const servers = this.servers;
    const match =
      servers.find((s) => s.host === host && s.port === port)
      ?? servers.find((s) => s.port === port);
    if (match) {
      this._setActive(match);
    }
  }

  /**
   * When HTTP to [client] is verified (e.g. debug fallback) but discovery has not
   * set [activeServer] yet, adopt the client's endpoint so status bar and UI match.
   */
  adoptClientEndpointIfNone(client: DriftApiClient): void {
    if (this._activeServer !== undefined) return;
    const now = Date.now();
    this._setActive({
      host: client.host,
      port: client.port,
      firstSeen: now,
      lastSeen: now,
      missedPolls: 0,
    });
  }

  /**
   * Show QuickPick for manual server selection.
   * - 0 servers: warns with Retry + View Log actions.
   * - 1 server: auto-selects.
   * - 2+ servers: shows QuickPick (guards against concurrent dialogs).
   */
  async selectServer(): Promise<void> {
    const servers = this.servers;
    if (servers.length === 0) {
      const action = await vscode.window.showWarningMessage(
        'No Drift debug servers found. Ensure your app is running with DriftDebugServer.start().',
        'Retry',
        'View Log',
      );
      if (action === 'Retry') {
        this._discovery.retry();
      } else if (action === 'View Log') {
        this._showLog?.();
      }
      return;
    }
    if (servers.length === 1) {
      this._setActive(servers[0]);
      return;
    }
    if (this._picking) return; // QuickPick already open

    this._picking = true;
    try {
      const items = servers.map((s) => ({
        label: `:${s.port}`,
        description: s.port === this._activeServer?.port ? '(active)' : '',
        server: s,
      }));

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a Drift debug server',
      });
      if (picked) {
        this._setActive(picked.server);
      }
    } finally {
      this._picking = false;
    }
  }

  dispose(): void {
    this._disposable.dispose();
    this._onDidChangeActive.dispose();
  }

  /**
   * React to discovery server list changes. 4-case state machine:
   * 1. Active server still alive → no-op.
   * 2. Active server died, 1 alternative → auto-switch.
   * 3. Active server died, 2+ alternatives → prompt user.
   * 4. No active server yet → auto-select if 1, prompt if 2+.
   */
  private _onServersChanged(servers: IServerInfo[]): void {
    this._persistKnownPorts(servers);
    const activeStillAlive = servers.some(
      (s) => s.port === this._activeServer?.port,
    );

    if (this._activeServer && activeStillAlive) {
      // Active server still alive — no action needed
      return;
    }

    if (this._activeServer && !activeStillAlive) {
      // Active server died — same rules as initial: one survivor auto-picks,
      // several → QuickPick so the user explicitly chooses the replacement.
      if (servers.length === 1) {
        this._setActive(servers[0]);
      } else if (servers.length > 1) {
        void this.selectServer();
      } else {
        this._setActive(undefined);
      }
      return;
    }

    // No active server yet — single server is unambiguous; multiple → QuickPick.
    if (servers.length === 1) {
      this._setActive(servers[0]);
    } else if (servers.length > 1) {
      void this.selectServer();
    }
  }

  private _setActive(server: IServerInfo | undefined): void {
    this._activeServer = server;
    if (server) {
      this._client.reconfigure(server.host, server.port);
      this._log?.(`Selected server :${server.port}`);
    }
    this._onDidChangeActive.fire(server);
  }

  private _persistKnownPorts(servers: IServerInfo[]): void {
    const ports = servers.map((s) => s.port);
    this._workspaceState.update(WORKSPACE_KEY, ports);
  }
}
