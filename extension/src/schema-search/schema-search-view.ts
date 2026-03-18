/**
 * WebviewViewProvider for the schema search sidebar panel.
 * Renders a search input + filter buttons; results list with cross-references.
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
  }

  private async _handleMessage(msg: SchemaSearchMessage): Promise<void> {
    switch (msg.command) {
      case 'search':
        await this._doSearch(msg.query, msg.scope, msg.typeFilter);
        break;
      case 'searchAll':
        await this._doBrowseAll();
        break;
      case 'navigate':
        await this._revealTable(msg.table);
        break;
    }
  }

  /**
   * Runs a search with a configurable timeout so the UI never hangs.
   * Stale results (from a superseded search) are discarded via gen check.
   */
  private async _doSearch(
    query: string,
    scope: 'all' | 'tables' | 'columns',
    typeFilter?: string,
  ): Promise<void> {
    const gen = ++this._searchGen;
    this._view?.webview.postMessage({ command: 'loading' });

    const sendError = (message: string): void => {
      if (gen !== this._searchGen) return;
      this._view?.webview.postMessage({ command: 'error', message });
    };

    const timeoutMs = vscode.workspace.getConfiguration('driftViewer').get<number>('schemaSearch.timeoutMs', DEFAULT_SEARCH_TIMEOUT_MS) ?? DEFAULT_SEARCH_TIMEOUT_MS;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error('Search timed out')),
        timeoutMs,
      );
    });

    try {
      const result = await Promise.race([
        this._engine.search(query, scope, typeFilter),
        timeoutPromise,
      ]);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      if (gen !== this._searchGen) return; // Stale result; discard
      this._view?.webview.postMessage({
        command: 'results',
        result,
        crossRefs: result.crossReferences,
      });
    } catch (err) {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      if (gen !== this._searchGen) return;
      const message =
        err instanceof Error ? err.message : String(err);
      sendError(
        message.includes('timed out')
          ? 'Search timed out. Try a more specific query or check the server.'
          : `Search failed: ${message}`,
      );
    }
  }

  /** Fast "Browse all tables" (one schemaMetadata call, no cross-refs). */
  private async _doBrowseAll(): Promise<void> {
    const gen = ++this._searchGen;
    this._view?.webview.postMessage({ command: 'loading' });
    try {
      const result = await this._engine.browseAllTables();
      if (gen !== this._searchGen) return;
      this._view?.webview.postMessage({
        command: 'results',
        result,
        crossRefs: result.crossReferences,
      });
    } catch (err) {
      if (gen !== this._searchGen) return;
      const message = err instanceof Error ? err.message : String(err);
      this._view?.webview.postMessage({ command: 'error', message: `Browse failed: ${message}` });
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
