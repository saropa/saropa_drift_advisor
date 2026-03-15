/**
 * Persists per-query performance baselines across debug sessions.
 * Uses exponential moving average capped at 20 samples so baselines
 * adapt over time without being thrown off by outliers.
 */

import type * as vscode from 'vscode';

const STORAGE_KEY = 'driftViewer.perfBaselines';
const MAX_SAMPLES = 20;

export interface IPerfBaseline {
  /** Normalized SQL (literals stripped, lowercased). */
  normalizedSql: string;
  /** Rolling average duration in ms. */
  avgDurationMs: number;
  /** Number of sessions that contributed to this average. */
  sampleCount: number;
  /** Timestamp of last update. */
  updatedAt: number;
}

export class PerfBaselineStore {
  private _baselines: Map<string, IPerfBaseline>;
  private _listeners: Array<() => void> = [];

  constructor(private readonly _state: vscode.Memento) {
    const raw = _state.get<IPerfBaseline[]>(STORAGE_KEY, []);
    this._baselines = new Map(raw.map((b) => [b.normalizedSql, b]));
  }

  onDidChange(listener: () => void): { dispose: () => void } {
    this._listeners.push(listener);
    return {
      dispose: () => {
        this._listeners = this._listeners.filter((l) => l !== listener);
      },
    };
  }

  get baselines(): ReadonlyMap<string, IPerfBaseline> {
    return this._baselines;
  }

  get size(): number {
    return this._baselines.size;
  }

  get(normalizedSql: string): IPerfBaseline | undefined {
    return this._baselines.get(normalizedSql);
  }

  /**
   * Record a new observation for a normalized SQL pattern.
   * Uses exponential moving average: newAvg = (oldAvg * cap + duration) / (cap + 1)
   * where cap = min(sampleCount, MAX_SAMPLES).
   */
  record(normalizedSql: string, durationMs: number): void {
    const existing = this._baselines.get(normalizedSql);
    if (existing) {
      const cap = Math.min(existing.sampleCount, MAX_SAMPLES);
      existing.avgDurationMs =
        (existing.avgDurationMs * cap + durationMs) / (cap + 1);
      existing.sampleCount = cap + 1;
      existing.updatedAt = Date.now();
    } else {
      this._baselines.set(normalizedSql, {
        normalizedSql,
        avgDurationMs: durationMs,
        sampleCount: 1,
        updatedAt: Date.now(),
      });
    }
    this._persist();
  }

  resetOne(normalizedSql: string): boolean {
    const deleted = this._baselines.delete(normalizedSql);
    if (deleted) this._persist();
    return deleted;
  }

  resetAll(): void {
    this._baselines.clear();
    this._persist();
  }

  private _persist(): void {
    void this._state.update(
      STORAGE_KEY,
      Array.from(this._baselines.values()),
    );
    for (const listener of this._listeners) {
      listener();
    }
  }
}
