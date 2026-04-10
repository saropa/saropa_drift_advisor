/**
 * Generic persistence store for analysis snapshots.
 * Each analysis type (index suggestions, size analytics, health score,
 * anomalies) gets its own AnalysisHistoryStore instance backed by
 * vscode.Memento workspace state.  Follows the PerfBaselineStore pattern.
 */

import type * as vscode from 'vscode';

/** Maximum number of saved snapshots per analysis type. */
const MAX_ENTRIES = 50;

/** A single timestamped analysis snapshot. */
export interface IAnalysisSnapshot<T> {
  /** Compact unique ID (base-36 timestamp + random suffix). */
  id: string;
  /** ISO-8601 timestamp of when the snapshot was saved. */
  savedAt: string;
  /** Human-readable date string for display in dropdowns. */
  label: string;
  /** The analysis result data. */
  data: T;
}

/**
 * Persists timestamped analysis snapshots in VS Code workspace state.
 * Generic over the analysis result type `T`.
 */
export class AnalysisHistoryStore<T> {
  private _entries: IAnalysisSnapshot<T>[];
  private _listeners: Array<() => void> = [];

  constructor(
    private readonly _state: vscode.Memento,
    private readonly _storageKey: string,
  ) {
    this._entries = _state.get<IAnalysisSnapshot<T>[]>(_storageKey, []);
  }

  /** Subscribe to changes. Returns a disposable to unsubscribe. */
  onDidChange(listener: () => void): { dispose: () => void } {
    this._listeners.push(listener);
    return {
      dispose: () => {
        this._listeners = this._listeners.filter((l) => l !== listener);
      },
    };
  }

  /** All saved snapshots, newest first. */
  getAll(): readonly IAnalysisSnapshot<T>[] {
    return this._entries;
  }

  /** Look up a snapshot by ID. */
  getById(id: string): IAnalysisSnapshot<T> | undefined {
    return this._entries.find((e) => e.id === id);
  }

  /** Number of saved snapshots. */
  get size(): number {
    return this._entries.length;
  }

  /**
   * Save a new snapshot of the current analysis data.
   * Oldest entries are evicted when the store exceeds MAX_ENTRIES.
   */
  save(data: T): IAnalysisSnapshot<T> {
    const id =
      Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const now = new Date();
    const entry: IAnalysisSnapshot<T> = {
      id,
      savedAt: now.toISOString(),
      label: now.toLocaleString(),
      data,
    };
    this._entries.unshift(entry);
    if (this._entries.length > MAX_ENTRIES) {
      this._entries.length = MAX_ENTRIES;
    }
    this._persist();
    return entry;
  }

  /** Delete a single snapshot by ID. */
  delete(id: string): boolean {
    const idx = this._entries.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    this._entries.splice(idx, 1);
    this._persist();
    return true;
  }

  /** Remove all saved snapshots. */
  clear(): void {
    this._entries = [];
    this._persist();
  }

  private _persist(): void {
    void this._state.update(this._storageKey, this._entries);
    for (const listener of this._listeners) {
      listener();
    }
  }
}
