/**
 * Time-Travel engine (Feature 60, Phase 2): pure snapshot-diff logic, no VS Code dependency.
 *
 * Reads the existing {@link SnapshotStore} (Feature 12) and, for a given table + snapshot index,
 * classifies every row against the PREVIOUS snapshot — added / removed / changed / unchanged —
 * so the slider can render any historical frame with diff highlighting.
 *
 * **Row identity.** Uses the snapshot table's real `pkColumns` (the store captures them) via the
 * shared {@link pkKey} helper. Only when a table has no primary key does it fall back to the first
 * column, and if there are no columns at all it falls back to a full-row JSON signature. This is
 * stronger than a fixed "first column is the PK" rule and matches how `computeTableDiff` already
 * keys rows elsewhere in the snapshot stack.
 *
 * **Out-of-range is not an error.** A bad index (or an empty store) returns an empty frame rather
 * than throwing — the slider drives this from user input and must never crash on a stale index.
 */

import { ISnapshotTable, SnapshotStore, pkKey } from '../timeline/snapshot-store';
import type {
  ITimeTravelRow,
  ITimeTravelState,
  ITimeTravelDiffSummary,
} from './time-travel-types';

function summarize(rows: ITimeTravelRow[]): ITimeTravelDiffSummary {
  const summary: ITimeTravelDiffSummary = { added: 0, removed: 0, changed: 0, unchanged: 0 };
  for (const r of rows) summary[r.status] += 1;
  return summary;
}

export class TimeTravelEngine {
  constructor(private readonly _store: SnapshotStore) {}

  /** Number of snapshots available to scrub through. */
  getSnapshotCount(): number {
    return this._store.snapshots.length;
  }

  /** Capture times (ms epoch) in snapshot order — drives the slider's tick labels. */
  getTimestamps(): number[] {
    return this._store.snapshots.map((s) => s.timestamp);
  }

  /**
   * Union of table names seen across all snapshots, sorted. A table that existed only in an
   * older snapshot (since dropped) is still listed so its history remains scrub-able.
   */
  getTableNames(): string[] {
    const names = new Set<string>();
    for (const snap of this._store.snapshots) {
      for (const name of snap.tables.keys()) names.add(name);
    }
    return [...names].sort();
  }

  /**
   * Build the frame for {@link table} at {@link snapshotIndex}, diffed against snapshotIndex-1.
   * The first snapshot (no previous) yields all-`added`. An out-of-range index yields an empty
   * frame with `timestamp: 0` rather than throwing.
   */
  getStateAt(table: string, snapshotIndex: number): ITimeTravelState {
    const snapshots = this._store.snapshots;
    const total = snapshots.length;

    if (total === 0 || snapshotIndex < 0 || snapshotIndex >= total) {
      return {
        snapshotIndex,
        table,
        columns: [],
        rows: [],
        totalSnapshots: total,
        timestamp: 0,
        diffSummary: { added: 0, removed: 0, changed: 0, unchanged: 0 },
      };
    }

    const current = snapshots[snapshotIndex];
    const previous = snapshotIndex > 0 ? snapshots[snapshotIndex - 1] : undefined;
    const curTable = current.tables.get(table);
    const prevTable = previous?.tables.get(table);
    const columns = curTable?.columns ?? prevTable?.columns ?? [];
    const rows = this._diffRows(columns, curTable, prevTable);

    return {
      snapshotIndex,
      table,
      columns,
      rows,
      totalSnapshots: total,
      timestamp: current.timestamp,
      diffSummary: summarize(rows),
    };
  }

  /**
   * Classify current-snapshot rows against the previous snapshot, then append rows that existed
   * previously but are gone now as `removed`. A table absent from a snapshot contributes no rows
   * from that side (its `rows` default to `[]`), so an entirely-absent table yields an empty frame.
   */
  private _diffRows(
    columns: string[],
    curTable: ISnapshotTable | undefined,
    prevTable: ISnapshotTable | undefined,
  ): ITimeTravelRow[] {
    const curRows = curTable?.rows ?? [];
    const prevRows = prevTable?.rows ?? [];

    // Prefer real PK columns; fall back to the first column, then to a full-row signature.
    const pkCols =
      (curTable?.pkColumns.length ? curTable.pkColumns : prevTable?.pkColumns) ?? [];
    const effectivePk = pkCols.length > 0 ? pkCols : columns.length > 0 ? [columns[0]] : [];
    const keyOf = (row: Record<string, unknown>): string =>
      effectivePk.length > 0 ? pkKey(row, effectivePk) : JSON.stringify(row);

    const prevMap = new Map(prevRows.map((r) => [keyOf(r), r]));
    const curKeys = new Set(curRows.map((r) => keyOf(r)));
    const rows: ITimeTravelRow[] = [];

    for (const row of curRows) {
      const prev = prevMap.get(keyOf(row));
      if (!prev) {
        rows.push({ data: row, status: 'added', changedColumns: [] });
        continue;
      }
      const changedColumns = columns.filter(
        (c) => JSON.stringify(prev[c]) !== JSON.stringify(row[c]),
      );
      rows.push({
        data: row,
        status: changedColumns.length > 0 ? 'changed' : 'unchanged',
        changedColumns,
      });
    }

    for (const row of prevRows) {
      if (!curKeys.has(keyOf(row))) {
        rows.push({ data: row, status: 'removed', changedColumns: [] });
      }
    }

    return rows;
  }
}
