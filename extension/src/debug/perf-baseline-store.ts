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
  /**
   * Rolling average result-row count for this query, tracked alongside the
   * duration so the regression detector can compare *per-row* cost rather than
   * raw wall-time. Optional: baselines recorded before row-count tracking was
   * added (and any caller that omits the count) leave this undefined, which the
   * detector treats as "no row-count signal" and falls back to raw comparison.
   */
  avgRowCount?: number;
  /** Number of sessions that contributed to this average. */
  sampleCount: number;
  /** Timestamp of last update. */
  updatedAt: number;
}

export class PerfBaselineStore {
  private _baselines: Map<string, IPerfBaseline>;
  private _listeners: Array<() => void> = [];

  constructor(private readonly _state: vscode.Memento) {
    // Guard against a corrupted/version-mismatched persisted value: a non-array
    // (or entries missing normalizedSql) would otherwise throw in the
    // constructor and break store creation. See plans/history/2026.06/2026.06.12/full-codebase-audit-2026.06.12.md M5.
    const raw = _state.get<IPerfBaseline[]>(STORAGE_KEY, []);
    const valid = Array.isArray(raw)
      ? raw.filter(
          (b): b is IPerfBaseline =>
            b != null && typeof (b as IPerfBaseline).normalizedSql === 'string',
        )
      : [];
    this._baselines = new Map(valid.map((b) => [b.normalizedSql, b]));
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
   *
   * `rowCount` (the query's result-row count) is averaged with the same EMA so
   * the detector can normalize by it. It is optional so the two-arg callers and
   * pre-existing tests keep working; an omitted/non-finite count simply leaves
   * the stored `avgRowCount` untouched.
   */
  record(normalizedSql: string, durationMs: number, rowCount?: number): void {
    const hasRows =
      typeof rowCount === 'number' && Number.isFinite(rowCount) && rowCount >= 0;
    const existing = this._baselines.get(normalizedSql);
    if (existing) {
      const cap = Math.min(existing.sampleCount, MAX_SAMPLES);
      existing.avgDurationMs =
        (existing.avgDurationMs * cap + durationMs) / (cap + 1);
      // Blend the new row count into the rolling average. Seed from the current
      // sample when the baseline predates row-count tracking so the first count
      // we ever see is taken as-is rather than diluted against a phantom zero.
      if (hasRows) {
        const prevRows =
          typeof existing.avgRowCount === 'number'
            ? existing.avgRowCount
            : rowCount;
        existing.avgRowCount = (prevRows * cap + rowCount) / (cap + 1);
      }
      existing.sampleCount = cap + 1;
      existing.updatedAt = Date.now();
    } else {
      this._baselines.set(normalizedSql, {
        normalizedSql,
        avgDurationMs: durationMs,
        avgRowCount: hasRows ? rowCount : undefined,
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
