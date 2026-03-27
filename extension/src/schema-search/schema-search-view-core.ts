/**
 * WebviewViewProvider for the schema search sidebar panel.
 */
import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { DriftConnectionPresentation } from '../connection-ui-state';
import type { IConnectionLog } from '../debug/debug-commands-types';
import type { DiscoveryUiState, ServerDiscovery } from '../server-discovery';
import { isTransientError } from '../transport/fetch-utils';
import { getLogVerbosity, shouldLogConnectionLine } from '../log-verbosity';
import { SchemaSearchEngine } from './schema-search-engine';
import { getSchemaSearchHtml } from './schema-search-html';
import type { SchemaSearchMessage } from './schema-search-types';

const DEFAULT_SEARCH_TIMEOUT_MS = 15_000;
export type RevealTableFn = (name: string) => Promise<void>;
export interface SchemaSearchViewOptions {
  connectionLog?: IConnectionLog;
}
export class SchemaSearchViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'driftViewer.schemaSearch';
  private readonly _engine: SchemaSearchEngine;
  private _connectionLog?: IConnectionLog;
  private _view?: vscode.WebviewView;
  private _searchGen = 0;
  private _presentation: DriftConnectionPresentation;
  private _discoveryUi: DiscoveryUiState | undefined;
  private _discoveryDisposable: vscode.Disposable | undefined;
  private _webviewReady = false;
  private _lastRequest:
    | { type: 'search'; query: string; scope: 'all' | 'tables' | 'columns'; typeFilter?: string }
    | { type: 'browseAll' }
    | null = null;
  constructor(
    client: DriftApiClient,
    private readonly _revealTable: RevealTableFn,
    options?: SchemaSearchViewOptions,
  ) {
    const cfg = vscode.workspace.getConfiguration('driftViewer');
    const crossRefMatchCap = cfg.get<number>('schemaSearch.crossRefMatchCap', 80) ?? 80;
    this._engine = new SchemaSearchEngine(client, { crossRefMatchCap });
    this._connectionLog = options?.connectionLog;
    this._presentation = {
      connected: false,
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
  }
  setConnectionPresentation(pres: DriftConnectionPresentation): void {
    this._presentation = pres;
    this._postConnectionState();
  }
  setConnected(connected: boolean): void {
    this.setConnectionPresentation({
      connected,
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
      this._webviewReady = true;
      this._log('webview ready — delivering queued connection state');
      this._postConnectionState();
      return;
    }
    try {
      switch (msg.command) {
        case 'search': await this._doSearch(msg.query, msg.scope, msg.typeFilter); break;
        case 'searchAll': await this._doBrowseAll(); break;
        case 'retry': await this._doRetry(); break;
        case 'navigate': await this._revealTableWithLogging(msg.table); break;
        case 'openConnectionLog': await vscode.commands.executeCommand('driftViewer.showConnectionLog'); break;
        case 'retryDiscovery': await vscode.commands.executeCommand('driftViewer.retryDiscovery'); break;
        case 'diagnoseConnection': await vscode.commands.executeCommand('driftViewer.diagnoseConnection'); break;
        case 'refreshConnectionUi': await vscode.commands.executeCommand('driftViewer.refreshConnectionUi'); break;
        case 'pauseDiscovery': await vscode.commands.executeCommand('driftViewer.pauseDiscovery'); break;
        case 'resumeDiscovery': await vscode.commands.executeCommand('driftViewer.resumeDiscovery'); break;
        case 'openConnectionHelp': await vscode.commands.executeCommand('driftViewer.openConnectionHelp'); break;
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
  private async _withOptionalRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const autoRetry =
      vscode.workspace.getConfiguration('driftViewer').get<boolean>('schemaSearch.autoRetryOnError', true) !== false;
    try {
      return await fn();
    } catch (first) {
      const msg = first instanceof Error ? first.message : String(first);
      this._log(`${label} first attempt failed — ${msg}`);
      if (!autoRetry) throw first;
      const retryOk =
        isTransientError(first)
        || msg.toLowerCase().includes('timed out')
        || msg.toLowerCase().includes('aborted');
      if (!retryOk) throw first;
      await new Promise((r) => setTimeout(r, 400));
      try {
        const second = await fn();
        this._log(`${label} succeeded on retry`);
        return second;
      } catch (secondErr) {
        const m2 = secondErr instanceof Error ? secondErr.message : String(secondErr);
        this._log(`${label} retry failed — ${m2}`);
        throw secondErr;
      }
    }
  }
  private _withTimeout<T>(promise: Promise<T>): Promise<T> {
    const timeoutMs = vscode.workspace.getConfiguration('driftViewer')
      .get<number>('schemaSearch.timeoutMs', DEFAULT_SEARCH_TIMEOUT_MS)
      ?? DEFAULT_SEARCH_TIMEOUT_MS;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('timed out')), timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    });
  }
  private async _doSearch(
    query: string,
    scope: 'all' | 'tables' | 'columns',
    typeFilter?: string,
  ): Promise<void> {
    this._lastRequest = { type: 'search', query, scope, typeFilter };
    const gen = ++this._searchGen;
    this._view?.webview.postMessage({ command: 'loading' });
    try {
      const result = await this._withTimeout(this._withOptionalRetry('search', () => this._engine.search(query, scope, typeFilter)));
      if (gen !== this._searchGen) return;
      this._view?.webview.postMessage({ command: 'results', result, crossRefs: result.crossReferences });
    } catch (err) {
      if (gen !== this._searchGen) return;
      const message = err instanceof Error ? err.message : String(err);
      this._log(`search final error — ${message}`);
      this._view?.webview.postMessage({
        command: 'error',
        message: message.includes('timed out')
          ? 'Search timed out. Try a narrower query, increase schemaSearch.timeoutMs, or check the server.'
          : `Search failed: ${message}`,
      });
    }
  }
  private async _doBrowseAll(): Promise<void> {
    this._lastRequest = { type: 'browseAll' };
    const gen = ++this._searchGen;
    this._view?.webview.postMessage({ command: 'loading' });
    try {
      const result = await this._withTimeout(this._withOptionalRetry('browseAll', () => this._engine.browseAllTables()));
      if (gen !== this._searchGen) return;
      this._view?.webview.postMessage({ command: 'results', result, crossRefs: result.crossReferences });
    } catch (err) {
      if (gen !== this._searchGen) return;
      const message = err instanceof Error ? err.message : String(err);
      this._log(`browseAll final error — ${message}`);
      this._view?.webview.postMessage({
        command: 'error',
        message: message.includes('timed out')
          ? 'Browse timed out. Check the server or increase schemaSearch.timeoutMs.'
          : `Browse failed: ${message}`,
      });
    }
  }
  private async _doRetry(): Promise<void> {
    if (!this._lastRequest) return;
    if (this._lastRequest.type === 'search') {
      const { query, scope, typeFilter } = this._lastRequest;
      await this._doSearch(query, scope, typeFilter);
    } else {
      await this._doBrowseAll();
    }
  }
}
function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  return nonce;
}
