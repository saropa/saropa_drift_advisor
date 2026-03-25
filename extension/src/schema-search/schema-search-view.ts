/**
 * WebviewViewProvider for the schema search sidebar panel.
 * Renders a search input + filter buttons; results list with cross-references.
 * Includes timeout protection, automatic retry on transient failures, connection
 * presentation (HTTP vs VM), diagnostics logging, and host-command fallbacks.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { DriftConnectionPresentation } from '../connection-ui-state';
import type { IConnectionLog } from '../debug/debug-commands-types';
import { isTransientError } from '../transport/fetch-utils';
import { getLogVerbosity, shouldLogConnectionLine } from '../log-verbosity';
import { SchemaSearchEngine } from './schema-search-engine';
import { getSchemaSearchHtml } from './schema-search-html';
import type { SchemaSearchMessage } from './schema-search-types';

/** Default search timeout (ms) when config is unset. */
const DEFAULT_SEARCH_TIMEOUT_MS = 15_000;

/** Callback to reveal a table in the Database Explorer tree view. */
export type RevealTableFn = (name: string) => Promise<void>;

export interface SchemaSearchViewOptions {
  /** Writes schema-search diagnostics (errors, retries) to the connection log. */
  connectionLog?: IConnectionLog;
}

export class SchemaSearchViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'driftViewer.schemaSearch';

  private readonly _engine: SchemaSearchEngine;
  private _connectionLog?: IConnectionLog;
  private _view?: vscode.WebviewView;
  private _searchGen = 0;
  private _presentation: DriftConnectionPresentation;

  /**
   * True once the webview script has sent its 'ready' message.
   * Until then, postMessage calls are silently dropped by VS Code because
   * the script's addEventListener('message', ...) hasn't been wired yet.
   * We defer _postConnectionState until the handshake arrives.
   */
  private _webviewReady = false;

  /** Stores the last search/browse request so "Retry" can replay it. */
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
    // Host calls setConnectionPresentation once wiring is ready.
    this._presentation = {
      connected: false,
      label: 'Not connected',
      hint: 'Waiting for connection state from the extension…',
      viaHttp: false,
      viaVm: false,
    };
  }

  /**
   * Inject or replace the connection log after construction. Called by
   * registerDebugCommandsPanels once debug deps are available (the provider
   * is created early in setupProviders before the log sink exists).
   */
  setConnectionLog(log: IConnectionLog | undefined): void {
    this._connectionLog = log;
  }

  /**
   * Returns diagnostic state for the "Diagnose Connection" output.
   * Helps developers and support spot why the Schema Search panel
   * might appear stuck loading or disconnected.
   */
  getDiagnosticState(): {
    viewResolved: boolean;
    webviewReady: boolean;
    presentationConnected: boolean;
    presentationLabel: string;
  } {
    return {
      viewResolved: this._view !== undefined,
      webviewReady: this._webviewReady,
      presentationConnected: this._presentation.connected,
      presentationLabel: this._presentation.label,
    };
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
    // Reset the ready flag — webview content is being (re-)created so the
    // script's message listener doesn't exist yet.
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

    webviewView.webview.onDidReceiveMessage(
      (msg: SchemaSearchMessage) => {
        void this._handleMessage(msg);
      },
    );

    // Re-post connection state whenever the webview becomes visible again
    // (e.g. the user switches back to the Drift sidebar). VS Code destroys
    // the webview DOM when the panel is hidden and re-resolves on show, but
    // if the webview is retained the DOM stays — yet the script loses state.
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._postConnectionState();
      }
    });

    // Do NOT call _postConnectionState here — the webview script hasn't
    // executed yet so the message listener isn't wired. The webview will
    // send a 'ready' message once its script loads, and _handleMessage
    // will deliver the queued connection state at that point.
  }

  /**
   * Full connection snapshot for the webview (label, hint, HTTP/VM flags).
   */
  setConnectionPresentation(pres: DriftConnectionPresentation): void {
    this._presentation = pres;
    this._postConnectionState();
  }

  /** @deprecated Prefer setConnectionPresentation; kept for narrow tests. */
  setConnected(connected: boolean): void {
    this.setConnectionPresentation({
      connected,
      label: connected ? 'Connected' : 'Not connected',
      hint: connected
        ? ''
        : 'Use Retry discovery or Diagnose in the panel, or check Output.',
      viaHttp: connected,
      viaVm: false,
    });
  }

  private _postConnectionState(): void {
    // Guard: skip if the view doesn't exist or the webview script hasn't
    // finished initialising. The current _presentation is always stored,
    // so the next 'ready' handshake or visibility change will deliver it.
    if (!this._view || !this._webviewReady) return;
    try {
      this._view.webview.postMessage({
        command: 'connectionState',
        connected: this._presentation.connected,
        label: this._presentation.label,
        hint: this._presentation.hint,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this._log(`postMessage connectionState failed — ${msg}`);
    }
  }

  private async _handleMessage(msg: SchemaSearchMessage): Promise<void> {
    // The 'ready' handshake is handled outside the try/catch so it always
    // succeeds — even if something else in the handler throws.
    if (msg.command === 'ready') {
      this._webviewReady = true;
      this._log('webview ready — delivering queued connection state');
      this._postConnectionState();
      return;
    }

    try {
      switch (msg.command) {
        case 'search':
          await this._doSearch(msg.query, msg.scope, msg.typeFilter);
          break;
        case 'searchAll':
          await this._doBrowseAll();
          break;
        case 'retry':
          await this._doRetry();
          break;
        case 'navigate':
          await this._revealTableWithLogging(msg.table);
          break;
        case 'openConnectionLog':
          await vscode.commands.executeCommand('driftViewer.showConnectionLog');
          break;
        case 'retryDiscovery':
          await vscode.commands.executeCommand('driftViewer.retryDiscovery');
          break;
        case 'diagnoseConnection':
          await vscode.commands.executeCommand('driftViewer.diagnoseConnection');
          break;
        case 'refreshConnectionUi':
          await vscode.commands.executeCommand('driftViewer.refreshConnectionUi');
          break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._log(`message handler error (${msg.command}) — ${message}`);
      this._view?.webview.postMessage({
        command: 'error',
        message: `Panel error: ${message}`,
      });
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
   * Runs [fn] once; on failure, optionally waits and retries once for transient errors.
   */
  private async _withOptionalRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const autoRetry =
      vscode.workspace
        .getConfiguration('driftViewer')
        .get<boolean>('schemaSearch.autoRetryOnError', true) !== false;
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
      timeoutId = setTimeout(
        () => reject(new Error('timed out')),
        timeoutMs,
      );
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
      const result = await this._withTimeout(
        this._withOptionalRetry('search', () =>
          this._engine.search(query, scope, typeFilter)),
      );
      if (gen !== this._searchGen) return;
      this._view?.webview.postMessage({
        command: 'results',
        result,
        crossRefs: result.crossReferences,
      });
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
      const result = await this._withTimeout(
        this._withOptionalRetry('browseAll', () => this._engine.browseAllTables()),
      );
      if (gen !== this._searchGen) return;
      this._view?.webview.postMessage({
        command: 'results',
        result,
        crossRefs: result.crossReferences,
      });
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
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
