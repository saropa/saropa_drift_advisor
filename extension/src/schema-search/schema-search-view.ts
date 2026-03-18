/**
 * WebviewViewProvider for the schema search sidebar panel.
 * Renders a search input + filter buttons; results list with cross-references.
 * Includes timeout protection, retry support, and connection-state awareness.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import { SchemaSearchEngine } from './schema-search-engine';
import { getSchemaSearchHtml } from './schema-search-html';
import type { SchemaSearchMessage } from './schema-search-types';

/** Default search timeout (ms) when config is unset. */
const DEFAULT_SEARCH_TIMEOUT_MS = 15_000;

/** Callback to reveal a table in the Database Explorer tree view. */
export type RevealTableFn = (name: string) => Promise<void>;

export class SchemaSearchViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'driftViewer.schemaSearch';

  private readonly _engine: SchemaSearchEngine;
  private _view?: vscode.WebviewView;
  private _searchGen = 0;
  private _connected = false;

  /** Stores the last search/browse request so "Retry" can replay it. */
  private _lastRequest:
    | { type: 'search'; query: string; scope: 'all' | 'tables' | 'columns'; typeFilter?: string }
    | { type: 'browseAll' }
    | null = null;

  constructor(
    client: DriftApiClient,
    private readonly _revealTable: RevealTableFn,
  ) {
    const cfg = vscode.workspace.getConfiguration('driftViewer');
    const crossRefMatchCap = cfg.get<number>('schemaSearch.crossRefMatchCap', 80) ?? 80;
    this._engine = new SchemaSearchEngine(client, { crossRefMatchCap });
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };

    const nonce = getNonce();
    webviewView.webview.html = getSchemaSearchHtml(nonce);

    webviewView.webview.onDidReceiveMessage(
      (msg: SchemaSearchMessage) => this._handleMessage(msg),
    );

    // Immediately inform the webview of the current connection state so it
    // renders the correct UI (idle vs disconnected) without waiting for a
    // server event.
    this._postConnectionState();
  }

  /** Notify the webview when the server connection state changes. */
  setConnected(connected: boolean): void {
    this._connected = connected;
    this._postConnectionState();
  }

  /** Send the current connection state to the webview. */
  private _postConnectionState(): void {
    this._view?.webview.postMessage({
      command: 'connectionState',
      connected: this._connected,
    });
  }

  private async _handleMessage(msg: SchemaSearchMessage): Promise<void> {
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
        await this._revealTable(msg.table);
        break;
    }
  }

  /**
   * Races a promise against the configured search timeout.
   * Always cleans up the internal timer to avoid leaks.
   * Shared by _doSearch and _doBrowseAll for consistent timeout behavior.
   */
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

  /**
   * Runs a search with timeout protection.
   * Stale results (from a superseded search) are discarded via gen check.
   */
  private async _doSearch(
    query: string,
    scope: 'all' | 'tables' | 'columns',
    typeFilter?: string,
  ): Promise<void> {
    // Remember the request so "Retry" can replay it after timeout/error.
    this._lastRequest = { type: 'search', query, scope, typeFilter };
    const gen = ++this._searchGen;
    this._view?.webview.postMessage({ command: 'loading' });

    try {
      const result = await this._withTimeout(
        this._engine.search(query, scope, typeFilter),
      );
      if (gen !== this._searchGen) return; // Stale result; discard
      this._view?.webview.postMessage({
        command: 'results',
        result,
        crossRefs: result.crossReferences,
      });
    } catch (err) {
      if (gen !== this._searchGen) return;
      const message = err instanceof Error ? err.message : String(err);
      this._view?.webview.postMessage({
        command: 'error',
        message: message.includes('timed out')
          ? 'Search timed out. Try a more specific query or check the server.'
          : `Search failed: ${message}`,
      });
    }
  }

  /**
   * Fast "Browse all tables" with the same timeout protection as search.
   * One schemaMetadata call, no cross-refs.
   */
  private async _doBrowseAll(): Promise<void> {
    this._lastRequest = { type: 'browseAll' };
    const gen = ++this._searchGen;
    this._view?.webview.postMessage({ command: 'loading' });
    try {
      const result = await this._withTimeout(
        this._engine.browseAllTables(),
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
      this._view?.webview.postMessage({
        command: 'error',
        message: message.includes('timed out')
          ? 'Browse timed out. Check that the server is running.'
          : `Browse failed: ${message}`,
      });
    }
  }

  /** Replays the last search or browse request (used by the "Retry" button). */
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
