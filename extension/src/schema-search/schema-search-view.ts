/**
 * WebviewViewProvider for the schema search sidebar panel.
 * Renders a search input + filter buttons; results list with cross-references.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import { SchemaSearchEngine } from './schema-search-engine';
import { getSchemaSearchHtml } from './schema-search-html';
import type { SchemaSearchMessage } from './schema-search-types';

/** Max time to wait for a search before showing a timeout error (ms). */
const SEARCH_TIMEOUT_MS = 15_000;

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
    this._engine = new SchemaSearchEngine(client);
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
      case 'navigate':
        await this._revealTable(msg.table);
        break;
    }
  }

  /**
   * Runs a search with a timeout so the UI never hangs.
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

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error('Search timed out')),
        SEARCH_TIMEOUT_MS,
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
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
