import * as vscode from 'vscode';
import { DriftApiClient } from '../api-client';
import type { ISnapshot, ISnapshotTable } from './snapshot-types';
import { rowsToObjects } from './snapshot-diff';
import { samplingOrderBy } from '../sql/sampling-order';

// Re-export the data shapes and diff helpers that used to live here, so the
// many modules importing them from './snapshot-store' keep their import paths.
export type {
  ISnapshot,
  ISnapshotTable,
  ITableDiff,
  IChangedRow,
} from './snapshot-types';
export { rowsToObjects, pkKey, computeTableDiff } from './snapshot-diff';

/** Max rows captured per table per snapshot. */
export const ROW_LIMIT = 1000;

/** Options for [SnapshotStore.capture] — e.g. bypass debounce after bulk apply. */
export interface ISnapshotCaptureOptions {
  /** When true, skip [minIntervalMs] so the VS Code timeline can refresh immediately. */
  bypassDebounce?: boolean;
}

/** In-memory store of database snapshots with rolling window. */
export class SnapshotStore {
  private _snapshots: ISnapshot[] = [];
  private readonly _maxSnapshots: number;
  private readonly _minIntervalMs: number;
  private readonly _captureDebounceMs: number;
  private readonly _log?: (msg: string) => void;
  private _lastCaptureTime = 0;
  private _capturing = false;

  // Trailing-edge debounce state for [requestCapture]. The pending client is
  // the one to scan when the quiet period elapses; coalescedWrites counts how
  // many write notifications collapsed into the pending re-dump (for the log).
  private _captureTimer: ReturnType<typeof setTimeout> | undefined;
  private _pendingClient: DriftApiClient | undefined;
  private _coalescedWrites = 0;

  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(
    maxSnapshots = 20,
    minIntervalMs = 10_000,
    captureDebounceMs = 200,
    log?: (msg: string) => void,
  ) {
    this._maxSnapshots = maxSnapshots;
    this._minIntervalMs = minIntervalMs;
    this._captureDebounceMs = captureDebounceMs;
    this._log = log;
  }

  get snapshots(): readonly ISnapshot[] {
    return this._snapshots;
  }

  getById(id: string): ISnapshot | undefined {
    return this._snapshots.find((s) => s.id === id);
  }

  getNewerSnapshot(snapshot: ISnapshot): ISnapshot | undefined {
    const idx = this._snapshots.indexOf(snapshot);
    if (idx < 0 || idx >= this._snapshots.length - 1) return undefined;
    return this._snapshots[idx + 1];
  }

  /**
   * Coalesce a burst of DB-write notifications into a single re-dump.
   *
   * The generation watcher fires once per detected DB write. Calling [capture]
   * on each one re-scans every physical table (schemaMetadata + a per-table
   * SELECT), so a single logical write fans out into a thousand-plus queries
   * (contacts ANR trace, 2026-06-06). The pre-existing [_minIntervalMs] guard
   * is leading-edge: it fires that scan on the *first* write of a burst — the
   * worst moment, mid write-storm (e.g. app startup) — and then silently drops
   * the rest, which can leave the open page stale on the final committed write.
   *
   * Trailing-edge debounce fixes both: each write (re)starts a quiet-period
   * timer; only once the writes settle does exactly one capture run, reflecting
   * the coalesced final state. Use [capture] directly with `bypassDebounce` for
   * user-initiated or post-bulk-apply refreshes that must show immediately.
   */
  requestCapture(client: DriftApiClient): void {
    this._coalescedWrites++;
    this._pendingClient = client;
    // Reset the quiet-period timer so further writes extend the window rather
    // than each kicking off their own re-dump.
    if (this._captureTimer !== undefined) {
      clearTimeout(this._captureTimer);
    }
    this._captureTimer = setTimeout(() => {
      void this._fireCoalescedCapture();
    }, this._captureDebounceMs);
  }

  /** Run the debounced re-dump once the write burst has gone quiet. */
  private async _fireCoalescedCapture(): Promise<void> {
    this._captureTimer = undefined;
    const client = this._pendingClient;
    if (client === undefined) return;

    // A prior capture may still be scanning (1k+ queries take real time). Wait
    // another window instead of dropping this burst, so the page is never left
    // stale on the latest committed write.
    if (this._capturing) {
      this._captureTimer = setTimeout(() => {
        void this._fireCoalescedCapture();
      }, this._captureDebounceMs);
      return;
    }

    const coalesced = this._coalescedWrites;
    this._coalescedWrites = 0;
    this._pendingClient = undefined;

    // The debounce window already rate-limited this re-dump, so bypass the
    // coarse [_minIntervalMs] floor — otherwise the final write of a burst that
    // lands within that floor of the previous capture would be dropped, leaving
    // the open page stale (acceptance criterion: no missed final write).
    const snapshot = await this.capture(client, { bypassDebounce: true });
    if (snapshot !== null) {
      const writes = coalesced === 1 ? '1 write' : `${coalesced} writes`;
      this._log?.(`timeline: re-dump (coalesced ${writes})`);
    }
  }

  /** Capture current DB state. Returns null if debounced or busy. */
  async capture(
    client: DriftApiClient,
    opts?: ISnapshotCaptureOptions,
  ): Promise<ISnapshot | null> {
    const now = Date.now();
    if (
      opts?.bypassDebounce !== true &&
      now - this._lastCaptureTime < this._minIntervalMs
    ) {
      return null;
    }
    if (this._capturing) return null;

    this._capturing = true;
    try {
      const metadata = await client.schemaMetadata();
      const tables = new Map<string, ISnapshotTable>();

      for (const table of metadata) {
        try {
          const pkCols = table.columns
            .filter((c) => c.pk)
            .map((c) => c.name);
          // Order by the declared PK, never rowid: WITHOUT ROWID tables and
          // views (e.g. PowerSync's ps_updated_rows and its table views) have
          // no rowid column, and ORDER BY rowid aborts the sweep on them (#32).
          const result = await client.sql(
            `SELECT * FROM "${table.name}"${samplingOrderBy(pkCols)} LIMIT ${ROW_LIMIT}`,
            { internal: true },
          );
          tables.set(table.name, {
            rowCount: table.rowCount,
            columns: result.columns,
            pkColumns: pkCols,
            rows: rowsToObjects(result.columns, result.rows),
          });
        } catch {
          // Table may have been dropped since metadata was fetched —
          // skip it and continue capturing the remaining tables.
        }
      }

      const snapshot: ISnapshot = {
        id: new Date(now).toISOString(),
        timestamp: now,
        tables,
      };

      this._snapshots.push(snapshot);
      if (this._snapshots.length > this._maxSnapshots) {
        this._snapshots.shift();
      }
      this._lastCaptureTime = now;
      this._onDidChange.fire();
      return snapshot;
    } catch {
      return null;
    } finally {
      this._capturing = false;
    }
  }

  clear(): void {
    this._snapshots = [];
    this._onDidChange.fire();
  }

  dispose(): void {
    // Cancel any pending coalesced re-dump so a timer can't fire into a
    // disposed store after the extension shuts down.
    if (this._captureTimer !== undefined) {
      clearTimeout(this._captureTimer);
      this._captureTimer = undefined;
    }
    this._onDidChange.dispose();
  }
}
