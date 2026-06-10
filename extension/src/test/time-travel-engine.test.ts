/**
 * Phase 2 gate for the Time-Travel Data Slider (Feature 60): the pure diff engine.
 *
 * Cases mirror the plan's testing matrix — single snapshot, add/remove/change classification,
 * first-snapshot-all-added, empty table, absent table, multi-column change, accurate summary,
 * and out-of-range index handling — plus a composite-PK case the real store supports.
 */

import * as assert from 'assert';
import { ISnapshot, ISnapshotTable, SnapshotStore } from '../timeline/snapshot-store';
import { TimeTravelEngine } from '../time-travel/time-travel-engine';
import type { RowStatus } from '../time-travel/time-travel-types';

function table(
  rows: Record<string, unknown>[],
  columns: string[],
  pkColumns: string[],
): ISnapshotTable {
  return { rowCount: rows.length, columns, pkColumns, rows };
}

/** Build a SnapshotStore preloaded with the given snapshots (bypasses live capture). */
function storeWith(snapshots: ISnapshot[]): SnapshotStore {
  const store = new SnapshotStore();
  // The store's _snapshots is private; push through the only public mutation seam available
  // in tests by casting. This keeps the engine reading the real getter.
  (store as unknown as { _snapshots: ISnapshot[] })._snapshots = snapshots;
  return store;
}

function snap(id: number, tables: Record<string, ISnapshotTable>): ISnapshot {
  const map = new Map<string, ISnapshotTable>();
  for (const [name, t] of Object.entries(tables)) map.set(name, t);
  return { id: String(id), timestamp: 1000 + id, tables: map };
}

const COLS = ['id', 'status'];
const PK = ['id'];

function statuses(engine: TimeTravelEngine, t: string, i: number): RowStatus[] {
  return engine.getStateAt(t, i).rows.map((r) => r.status);
}

describe('TimeTravelEngine', () => {
  it('single snapshot: first frame has no previous, so all rows are "added"', () => {
    const engine = new TimeTravelEngine(
      storeWith([snap(0, { orders: table([{ id: 1, status: 'a' }], COLS, PK) })]),
    );
    assert.strictEqual(engine.getSnapshotCount(), 1);
    assert.deepStrictEqual(statuses(engine, 'orders', 0), ['added']);
  });

  it('row added between snapshots → "added"', () => {
    const engine = new TimeTravelEngine(
      storeWith([
        snap(0, { orders: table([{ id: 1, status: 'a' }], COLS, PK) }),
        snap(1, { orders: table([{ id: 1, status: 'a' }, { id: 2, status: 'b' }], COLS, PK) }),
      ]),
    );
    const state = engine.getStateAt('orders', 1);
    const added = state.rows.filter((r) => r.status === 'added');
    assert.strictEqual(added.length, 1);
    assert.strictEqual(added[0].data.id, 2);
  });

  it('row removed between snapshots → "removed"', () => {
    const engine = new TimeTravelEngine(
      storeWith([
        snap(0, { orders: table([{ id: 1, status: 'a' }, { id: 2, status: 'b' }], COLS, PK) }),
        snap(1, { orders: table([{ id: 1, status: 'a' }], COLS, PK) }),
      ]),
    );
    const removed = engine.getStateAt('orders', 1).rows.filter((r) => r.status === 'removed');
    assert.strictEqual(removed.length, 1);
    assert.strictEqual(removed[0].data.id, 2);
  });

  it('row value changed → "changed" with changedColumns populated', () => {
    const engine = new TimeTravelEngine(
      storeWith([
        snap(0, { orders: table([{ id: 1, status: 'pending' }], COLS, PK) }),
        snap(1, { orders: table([{ id: 1, status: 'shipped' }], COLS, PK) }),
      ]),
    );
    const changed = engine.getStateAt('orders', 1).rows.filter((r) => r.status === 'changed');
    assert.strictEqual(changed.length, 1);
    assert.deepStrictEqual(changed[0].changedColumns, ['status']);
  });

  it('multiple changed columns are all listed', () => {
    const cols = ['id', 'a', 'b', 'c'];
    const engine = new TimeTravelEngine(
      storeWith([
        snap(0, { t: table([{ id: 1, a: 1, b: 1, c: 1 }], cols, ['id']) }),
        snap(1, { t: table([{ id: 1, a: 2, b: 1, c: 9 }], cols, ['id']) }),
      ]),
    );
    const changed = engine.getStateAt('t', 1).rows.find((r) => r.status === 'changed');
    assert.deepStrictEqual(changed?.changedColumns, ['a', 'c']);
  });

  it('unchanged row is classified "unchanged" (no false positives)', () => {
    const engine = new TimeTravelEngine(
      storeWith([
        snap(0, { orders: table([{ id: 1, status: 'a' }], COLS, PK) }),
        snap(1, { orders: table([{ id: 1, status: 'a' }], COLS, PK) }),
      ]),
    );
    assert.deepStrictEqual(statuses(engine, 'orders', 1), ['unchanged']);
  });

  it('empty table at a snapshot → empty rows array', () => {
    const engine = new TimeTravelEngine(
      storeWith([snap(0, { orders: table([], COLS, PK) })]),
    );
    assert.deepStrictEqual(engine.getStateAt('orders', 0).rows, []);
  });

  it('table not present in any snapshot → empty rows array', () => {
    const engine = new TimeTravelEngine(
      storeWith([snap(0, { orders: table([{ id: 1, status: 'a' }], COLS, PK) })]),
    );
    assert.deepStrictEqual(engine.getStateAt('ghost', 0).rows, []);
  });

  it('diff summary counts are accurate across all statuses', () => {
    const engine = new TimeTravelEngine(
      storeWith([
        snap(0, {
          orders: table([{ id: 1, status: 'a' }, { id: 2, status: 'b' }, { id: 3, status: 'c' }], COLS, PK),
        }),
        snap(1, {
          // id1 unchanged, id2 changed, id3 removed, id4 added
          orders: table([{ id: 1, status: 'a' }, { id: 2, status: 'B' }, { id: 4, status: 'd' }], COLS, PK),
        }),
      ]),
    );
    const summary = engine.getStateAt('orders', 1).diffSummary;
    assert.deepStrictEqual(summary, { added: 1, removed: 1, changed: 1, unchanged: 1 });
  });

  it('out-of-range index returns an empty frame, not a throw', () => {
    const engine = new TimeTravelEngine(
      storeWith([snap(0, { orders: table([{ id: 1, status: 'a' }], COLS, PK) })]),
    );
    for (const bad of [-1, 1, 99]) {
      const state = engine.getStateAt('orders', bad);
      assert.deepStrictEqual(state.rows, []);
      assert.strictEqual(state.timestamp, 0);
    }
  });

  it('empty store: count 0, no table names, empty frame', () => {
    const engine = new TimeTravelEngine(storeWith([]));
    assert.strictEqual(engine.getSnapshotCount(), 0);
    assert.deepStrictEqual(engine.getTableNames(), []);
    assert.deepStrictEqual(engine.getStateAt('x', 0).rows, []);
  });

  it('composite primary key: rows keyed on all PK columns (no false add/remove)', () => {
    const cols = ['a', 'b', 'v'];
    const pk = ['a', 'b'];
    const engine = new TimeTravelEngine(
      storeWith([
        snap(0, { t: table([{ a: 1, b: 1, v: 'x' }, { a: 1, b: 2, v: 'y' }], cols, pk) }),
        snap(1, { t: table([{ a: 1, b: 1, v: 'x' }, { a: 1, b: 2, v: 'CHANGED' }], cols, pk) }),
      ]),
    );
    const summary = engine.getStateAt('t', 1).diffSummary;
    assert.deepStrictEqual(summary, { added: 0, removed: 0, changed: 1, unchanged: 1 });
  });

  it('getTableNames unions across snapshots and sorts', () => {
    const engine = new TimeTravelEngine(
      storeWith([
        snap(0, { zebra: table([], ['id'], ['id']) }),
        snap(1, { apple: table([], ['id'], ['id']), zebra: table([], ['id'], ['id']) }),
      ]),
    );
    assert.deepStrictEqual(engine.getTableNames(), ['apple', 'zebra']);
  });
});
