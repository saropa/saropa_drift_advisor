/**
 * Shared types for the Time-Travel Data Slider (Feature 60).
 *
 * The engine turns the existing snapshot history (`SnapshotStore`, Feature 12) into a
 * per-snapshot, per-table view where each row is classified against the PREVIOUS snapshot, so
 * the webview can render a frame at any point on the timeline with diff highlighting.
 */

/** How a row at snapshot N compares to the same row at snapshot N-1. */
export type RowStatus = 'unchanged' | 'added' | 'removed' | 'changed';

/** One row in a time-travel frame, tagged with how it changed since the previous snapshot. */
export interface ITimeTravelRow {
  data: Record<string, unknown>;
  status: RowStatus;
  /** Column names whose value differs from the previous snapshot (only for `changed`). */
  changedColumns: string[];
}

/** Counts behind the "+3 added, 1 changed" summary line. */
export interface ITimeTravelDiffSummary {
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
}

/** A complete frame: one table at one snapshot index, diffed against the previous snapshot. */
export interface ITimeTravelState {
  snapshotIndex: number;
  table: string;
  /** Column order for rendering, taken from the snapshot (current, else previous). */
  columns: string[];
  rows: ITimeTravelRow[];
  totalSnapshots: number;
  /** Capture time of this snapshot (ms epoch), or 0 when the index is out of range. */
  timestamp: number;
  diffSummary: ITimeTravelDiffSummary;
}
