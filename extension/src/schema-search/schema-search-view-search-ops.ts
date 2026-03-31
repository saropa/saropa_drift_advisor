/**
 * Schema search operations — search, browse, retry, timeout, and nonce generation.
 * Extracted from schema-search-view-core to keep files under the line cap.
 */
import * as vscode from 'vscode';
import { isTransientError } from '../transport/fetch-utils';
import type { SchemaSearchEngine } from './schema-search-engine';

const DEFAULT_SEARCH_TIMEOUT_MS = 15_000;

/** Log sink matching the provider's internal log interface. */
export type SearchOpsLog = (line: string) => void;

/**
 * Encapsulates search state (generation counter, last request) and operations
 * so the view provider class stays under the line cap.
 */
export class SchemaSearchOps {
  private _searchGen = 0;
  private _lastRequest:
    | { type: 'search'; query: string; scope: 'all' | 'tables' | 'columns'; typeFilter?: string }
    | { type: 'browseAll' }
    | null = null;

  constructor(
    private readonly _engine: SchemaSearchEngine,
    private readonly _getView: () => vscode.WebviewView | undefined,
    private readonly _log: SearchOpsLog,
  ) {}

  async doSearch(
    query: string,
    scope: 'all' | 'tables' | 'columns',
    typeFilter?: string,
  ): Promise<void> {
    this._lastRequest = { type: 'search', query, scope, typeFilter };
    const gen = ++this._searchGen;
    this._getView()?.webview.postMessage({ command: 'loading' });
    try {
      const result = await this._withTimeout(
        this._withOptionalRetry('search', () => this._engine.search(query, scope, typeFilter)),
      );
      if (gen !== this._searchGen) return;
      this._getView()?.webview.postMessage({ command: 'results', result, crossRefs: result.crossReferences });
    } catch (err) {
      if (gen !== this._searchGen) return;
      const message = err instanceof Error ? err.message : String(err);
      this._log(`search final error — ${message}`);
      this._getView()?.webview.postMessage({
        command: 'error',
        message: message.includes('timed out')
          ? 'Search timed out. Try a narrower query, increase schemaSearch.timeoutMs, or check the server.'
          : `Search failed: ${message}`,
      });
    }
  }

  async doBrowseAll(): Promise<void> {
    this._lastRequest = { type: 'browseAll' };
    const gen = ++this._searchGen;
    this._getView()?.webview.postMessage({ command: 'loading' });
    try {
      const result = await this._withTimeout(
        this._withOptionalRetry('browseAll', () => this._engine.browseAllTables()),
      );
      if (gen !== this._searchGen) return;
      this._getView()?.webview.postMessage({ command: 'results', result, crossRefs: result.crossReferences });
    } catch (err) {
      if (gen !== this._searchGen) return;
      const message = err instanceof Error ? err.message : String(err);
      this._log(`browseAll final error — ${message}`);
      this._getView()?.webview.postMessage({
        command: 'error',
        message: message.includes('timed out')
          ? 'Browse timed out. Check the server or increase schemaSearch.timeoutMs.'
          : `Browse failed: ${message}`,
      });
    }
  }

  async doRetry(): Promise<void> {
    if (!this._lastRequest) return;
    if (this._lastRequest.type === 'search') {
      const { query, scope, typeFilter } = this._lastRequest;
      await this.doSearch(query, scope, typeFilter);
    } else {
      await this.doBrowseAll();
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
}

/** Generate a random nonce for CSP. */
export function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  return nonce;
}
