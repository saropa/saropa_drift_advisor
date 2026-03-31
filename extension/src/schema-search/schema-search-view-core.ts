/**
 * WebviewViewProvider for the schema search sidebar panel.
 */
import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { DriftConnectionPresentation } from '../connection-ui-state';
import type { IConnectionLog } from '../debug/debug-commands-types';
import type { DiscoveryUiState, ServerDiscovery } from '../server-discovery';
import { getLogVerbosity, shouldLogConnectionLine } from '../log-verbosity';
import {
  findDriftColumnGetterLocation,
  findDriftTableClassLocation,
  openLocationOrNotify,
} from '../definition/drift-source-locator';
import { SchemaSearchEngine } from './schema-search-engine';
import { getSchemaSearchHtml } from './schema-search-html';
import type { SchemaSearchMessage } from './schema-search-types';
import { SchemaSearchOps, getNonce } from './schema-search-view-search-ops';
export type RevealTableFn = (name: string) => Promise<void>;
export interface SchemaSearchViewOptions {
  connectionLog?: IConnectionLog;
  /** Used to dispose webview timers with the extension (avoid orphaned timeouts on reload). */
  extensionContext?: vscode.ExtensionContext;
}
export class SchemaSearchViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'driftViewer.schemaSearch';
  private readonly _ops: SchemaSearchOps;
  private _connectionLog?: IConnectionLog;
  private _view?: vscode.WebviewView;
  private _presentation: DriftConnectionPresentation;
  private _discoveryUi: DiscoveryUiState | undefined;
  private _discoveryDisposable: vscode.Disposable | undefined;
  private _webviewReady = false;
  private _readyFallbackTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly _extensionContext?: vscode.ExtensionContext;
  constructor(
    client: DriftApiClient,
    private readonly _revealTable: RevealTableFn,
    options?: SchemaSearchViewOptions,
  ) {
    const cfg = vscode.workspace.getConfiguration('driftViewer');
    const crossRefMatchCap = cfg.get<number>('schemaSearch.crossRefMatchCap', 80) ?? 80;
    const engine = new SchemaSearchEngine(client, { crossRefMatchCap });
    this._ops = new SchemaSearchOps(engine, () => this._view, (line) => this._log(line));
    this._connectionLog = options?.connectionLog;
    this._extensionContext = options?.extensionContext;
    this._presentation = {
      connected: false,
      schemaOperationsEnabled: false,
      persistedSchemaAvailable: false,
      label: 'Not connected',
      hint: 'Waiting for connection state from the extension…',
      viaHttp: false,
      viaVm: false,
    };
  }
  setConnectionLog(log: IConnectionLog | undefined): void {
    this._connectionLog = log;
  }
  getDiagnosticState(): {
    viewResolved: boolean;
    webviewReady: boolean;
    presentationConnected: boolean;
    presentationLabel: string;
    discoveryActivity: string;
  } {
    return {
      viewResolved: this._view !== undefined,
      webviewReady: this._webviewReady,
      presentationConnected: this._presentation.connected,
      presentationLabel: this._presentation.label,
      discoveryActivity: this._discoveryUi?.activity ?? '(discovery not wired)',
    };
  }
  attachDiscoveryMonitor(discovery: ServerDiscovery): void {
    this._discoveryDisposable?.dispose();
    this._discoveryUi = discovery.getDiscoverySnapshot();
    this._discoveryDisposable = discovery.onDidChangeDiscoveryUi((s) => {
      this._discoveryUi = s;
      this._postConnectionState();
    });
  }
  disposeDiscoveryMonitor(): void {
    this._discoveryDisposable?.dispose();
    this._discoveryDisposable = undefined;
  }
  private _log(line: string): void {
    if (!this._connectionLog) return;
    const full = `[${new Date().toISOString()}] Schema Search: ${line}`;
    if (shouldLogConnectionLine(full, getLogVerbosity())) {
      this._connectionLog.appendLine(full);
    }
  }
  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;
    this._webviewReady = false;
    if (this._readyFallbackTimer !== undefined) {
      clearTimeout(this._readyFallbackTimer);
      this._readyFallbackTimer = undefined;
    }
    webviewView.webview.options = { enableScripts: true };
    const nonce = getNonce();
    try {
      webviewView.webview.html = getSchemaSearchHtml(nonce);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._log(`failed to build webview HTML — ${msg}`);
      webviewView.webview.html = `<body style="color:var(--vscode-errorForeground)">Schema Search failed to load UI: ${msg}</body>`;
      return;
    }
    webviewView.webview.onDidReceiveMessage((msg: SchemaSearchMessage) => {
      void this._handleMessage(msg);
    });
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) this._postConnectionState();
    });
    // If the embedded script throws before posting `ready`, the host would never deliver
    // `connectionState` and the panel stays visually blank — recover after a short delay.
    // Only when tied to extension lifecycle: unit tests omit extensionContext so timers
    // do not fire asynchronously and destabilize ready-handshake assertions.
    if (this._extensionContext) {
      this._readyFallbackTimer = setTimeout(() => {
        this._readyFallbackTimer = undefined;
        if (this._webviewReady) return;
        this._log(
          'webview `ready` not received — forcing delivery of connection state (check webview console for script errors)',
        );
        this._webviewReady = true;
        this._postConnectionState();
      }, 450);
      this._extensionContext.subscriptions.push(
        webviewView.onDidDispose(() => {
          if (this._readyFallbackTimer !== undefined) {
            clearTimeout(this._readyFallbackTimer);
            this._readyFallbackTimer = undefined;
          }
        }),
      );
    }
  }
  setConnectionPresentation(pres: DriftConnectionPresentation): void {
    this._presentation = pres;
    this._postConnectionState();
  }
  setConnected(connected: boolean): void {
    this.setConnectionPresentation({
      connected,
      schemaOperationsEnabled: connected,
      persistedSchemaAvailable: false,
      label: connected ? 'Connected' : 'Not connected',
      hint: connected ? '' : 'Use Retry discovery or Diagnose in the panel, or check Output.',
      viaHttp: connected,
      viaVm: false,
    });
  }
  private _postConnectionState(): void {
    if (!this._view || !this._webviewReady) {
      this._log(`postConnectionState skipped — view=${!!this._view} ready=${this._webviewReady} connected=${this._presentation.connected}`);
      return;
    }
    try {
      this._view.webview.postMessage({
        command: 'connectionState',
        connected: this._presentation.connected,
        schemaOperationsEnabled: this._presentation.schemaOperationsEnabled,
        persistedSchemaAvailable: this._presentation.persistedSchemaAvailable,
        label: this._presentation.label,
        hint: this._presentation.hint,
        discovery: this._discoveryUi ?? null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._log(`postMessage connectionState failed — ${msg}`);
    }
  }
  private async _handleMessage(msg: SchemaSearchMessage): Promise<void> {
    if (msg.command === 'ready') {
      if (this._readyFallbackTimer !== undefined) {
        clearTimeout(this._readyFallbackTimer);
        this._readyFallbackTimer = undefined;
      }
      const firstReady = !this._webviewReady;
      this._webviewReady = true;
      if (firstReady) {
        this._log('webview ready — delivering queued connection state');
      }
      this._postConnectionState();
      return;
    }
    try {
      switch (msg.command) {
        case 'search': await this._ops.doSearch(msg.query, msg.scope, msg.typeFilter); break;
        case 'searchAll': await this._ops.doBrowseAll(); break;
        case 'retry': await this._ops.doRetry(); break;
        case 'navigate':
          if (msg.openSource === false) {
            await this._revealTableWithLogging(msg.table);
          } else {
            await this._openSchemaInSource(msg.table, msg.column);
          }
          break;
        case 'openConnectionLog': await vscode.commands.executeCommand('driftViewer.showConnectionLog'); break;
        case 'retryDiscovery': await vscode.commands.executeCommand('driftViewer.retryDiscovery'); break;
        case 'diagnoseConnection': await vscode.commands.executeCommand('driftViewer.diagnoseConnection'); break;
        case 'refreshConnectionUi': await vscode.commands.executeCommand('driftViewer.refreshConnectionUi'); break;
        case 'pauseDiscovery': await vscode.commands.executeCommand('driftViewer.pauseDiscovery'); break;
        case 'resumeDiscovery': await vscode.commands.executeCommand('driftViewer.resumeDiscovery'); break;
        case 'openConnectionHelp': await vscode.commands.executeCommand('driftViewer.openConnectionHelp'); break;
        case 'openInBrowser': await vscode.commands.executeCommand('driftViewer.openInBrowser'); break;
        case 'showTroubleshooting': await vscode.commands.executeCommand('driftViewer.showTroubleshooting'); break;
        case 'forwardPortAndroid': await vscode.commands.executeCommand('driftViewer.forwardPortAndroid'); break;
        case 'selectServer': await vscode.commands.executeCommand('driftViewer.selectServer'); break;
        case 'openGettingStarted':
          await vscode.env.openExternal(
            vscode.Uri.parse('https://github.com/saropa/saropa_drift_advisor#getting-started'),
          );
          break;
        case 'openReportIssue':
          await vscode.env.openExternal(
            vscode.Uri.parse('https://github.com/saropa/saropa_drift_advisor/issues'),
          );
          break;
        case 'scanDartSchema':
          await vscode.commands.executeCommand('driftViewer.scanDartSchemaDefinitions');
          break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._log(`message handler error (${msg.command}) — ${message}`);
      this._view?.webview.postMessage({ command: 'error', message: `Panel error: ${message}` });
    }
  }
  private async _revealTableWithLogging(name: string): Promise<void> {
    try {
      await this._revealTable(name);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._log(`revealTable(${name}) failed — ${message}`);
      void vscode.window.showWarningMessage(`Could not reveal table "${name}": ${message}`);
    }
  }
  /**
   * Jumps to the Drift table/column definition in Dart; falls back to revealing the Database tree row.
   */
  private async _openSchemaInSource(table: string, column?: string): Promise<void> {
    try {
      let loc: import('vscode').Location | null;
      if (column) {
        const result = await findDriftColumnGetterLocation(column, table);
        // Use exact getter location, or fall back to the table class.
        loc = result.location ?? result.tableClassFallback;
      } else {
        const tableResult = await findDriftTableClassLocation(table);
        loc = tableResult.location;
      }
      const detail = column
        ? `column "${column}" on table "${table}"`
        : `table "${table}"`;
      const opened = await openLocationOrNotify(loc, detail);
      if (!opened) await this._revealTableWithLogging(table);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._log(`openSchemaInSource(${table}, ${column ?? ''}) failed — ${message}`);
      await this._revealTableWithLogging(table);
    }
  }
}
