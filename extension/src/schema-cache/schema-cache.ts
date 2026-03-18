/**
 * In-memory schema cache with optional TTL and persisted "last known" for fast startup.
 * Call invalidate() when server or generation changes; use prewarm() after connect.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { TableMetadata } from '../api-types';

export interface SchemaCacheOptions {
  /** Max age of in-memory cache before refetch (ms). Default 30_000. */
  ttlMs?: number;
  /** Workspace state key for last-known schema (stale-while-revalidate). Omit to disable persist. */
  persistKey?: string;
}

/** Default TTL when not configured (30s). */
const DEFAULT_TTL_MS = 30_000;

/**
 * Safety timeout for individual fetch/revalidate operations (ms).
 * Prevents _fetchPromise from hanging indefinitely if the HTTP/VM transport
 * fails to resolve or reject (e.g. AbortController not firing on Windows).
 * Generous enough to not interfere with normal fetch + retry (~16s).
 */
const FETCH_SAFETY_TIMEOUT_MS = 30_000;

/**
 * Shared cache for schemaMetadata(). Reduces duplicate fetches and supports
 * showing last-known schema immediately while revalidating in background.
 */
export class SchemaCache {
  private readonly _client: DriftApiClient;
  private readonly _workspaceState: vscode.Memento;
  private readonly _ttlMs: number;
  private readonly _persistKey: string | undefined;

  private _memory: { data: TableMetadata[]; timestamp: number } | null = null;
  private _fetchPromise: Promise<TableMetadata[]> | null = null;
  private _revalidating = false;

  private readonly _onDidUpdate = new vscode.EventEmitter<void>();
  /** Fires after cache is updated (e.g. after background revalidate). */
  readonly onDidUpdate = this._onDidUpdate.event;

  constructor(
    client: DriftApiClient,
    workspaceState: vscode.Memento,
    options: SchemaCacheOptions = {},
  ) {
    this._client = client;
    this._workspaceState = workspaceState;
    this._ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this._persistKey = options.persistKey;
  }

  /**
   * Returns schema from cache if valid, or persisted + background revalidate, or fetches.
   * Call invalidate() when server or generation changes so next get refetches.
   */
  async getSchemaMetadata(forceRefresh = false): Promise<TableMetadata[]> {
    if (!forceRefresh && this._memory !== null) {
      const age = Date.now() - this._memory.timestamp;
      if (age < this._ttlMs) return this._memory.data;
    }

    if (forceRefresh) {
      this._memory = null;
      this._fetchPromise = null;
    }

    if (this._fetchPromise !== null) {
      return this._fetchPromise;
    }

    if (!forceRefresh && this._persistKey) {
      const persisted = this._workspaceState.get<TableMetadata[]>(this._persistKey);
      if (persisted !== undefined) {
        void this._revalidate();
        return persisted;
      }
    }

    return this._fetch();
  }

  /** Clears in-memory cache. Next getSchemaMetadata may still return persisted then revalidate. */
  invalidate(): void {
    this._memory = null;
    this._fetchPromise = null;
  }

  /** Fetches schema in background to populate cache (e.g. after discovery finds server). */
  prewarm(): void {
    void this.getSchemaMetadata(true);
  }

  private _fetch(): Promise<TableMetadata[]> {
    // Safety timeout: if the underlying transport hangs (never resolves/rejects),
    // reject after FETCH_SAFETY_TIMEOUT_MS so _fetchPromise is cleared and
    // subsequent callers can retry instead of blocking forever.
    const safety = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error('Schema metadata fetch timed out')),
        FETCH_SAFETY_TIMEOUT_MS,
      );
    });
    const p = Promise.race([this._client.schemaMetadata(), safety])
      .then((data) => {
        this._memory = { data, timestamp: Date.now() };
        this._fetchPromise = null;
        if (this._persistKey) {
          void this._workspaceState.update(this._persistKey, data);
        }
        this._onDidUpdate.fire();
        return data;
      })
      .catch((err) => {
        this._fetchPromise = null;
        throw err;
      });
    this._fetchPromise = p;
    return p;
  }

  private async _revalidate(): Promise<void> {
    if (this._revalidating) return;
    this._revalidating = true;
    try {
      // Safety timeout mirrors _fetch: prevents _revalidating from staying
      // true forever if the transport hangs, which would block all future
      // background revalidations.
      const safety = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('Revalidation timed out')),
          FETCH_SAFETY_TIMEOUT_MS,
        );
      });
      const data = await Promise.race([this._client.schemaMetadata(), safety]);
      this._memory = { data, timestamp: Date.now() };
      if (this._persistKey) {
        void this._workspaceState.update(this._persistKey, data);
      }
      this._onDidUpdate.fire();
    } catch {
      // Keep previous cache; next explicit get will retry
    } finally {
      this._revalidating = false;
    }
  }
}
