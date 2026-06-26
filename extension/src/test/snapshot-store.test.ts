import * as assert from 'assert';
import * as sinon from 'sinon';
import { DriftApiClient } from '../api-client';
import {
  SnapshotStore,
  CAPTURE_MAX_ROWS,
  computeTableDiff,
  rowsToObjects,
} from '../timeline/snapshot-store';

function makeResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function metadataJson(tables = [
  { name: 'users', rowCount: 3, columns: [{ name: 'id', type: 'INTEGER', pk: true }, { name: 'name', type: 'TEXT', pk: false }] },
]) {
  return tables;
}

function sqlJson(columns: string[], rows: unknown[][]) {
  // The real /api/sql emits object-rows ({col: value}), not the columnar
  // {columns, rows[][]} shape; client.sql() converts to columnar. Build the
  // server shape here so the test exercises that conversion (GitHub issue #32).
  return { rows: rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]]))) };
}

describe('SnapshotStore', () => {
  let fetchStub: sinon.SinonStub;
  let clock: sinon.SinonFakeTimers;
  let client: DriftApiClient;

  beforeEach(() => {
    fetchStub = sinon.stub(globalThis, 'fetch');
    clock = sinon.useFakeTimers({ now: 1000000 });
    client = new DriftApiClient('127.0.0.1', 8642);
  });

  afterEach(() => {
    fetchStub.restore();
    clock.restore();
  });

  function stubCapture(): void {
    fetchStub.withArgs(sinon.match(/schema\/metadata/)).callsFake(async () =>
      makeResponse(metadataJson()),
    );
    fetchStub.withArgs(sinon.match(/api\/sql/)).callsFake(async () =>
      makeResponse(sqlJson(['id', 'name'], [[1, 'Alice'], [2, 'Bob'], [3, 'Carol']])),
    );
  }

  describe('capture()', () => {
    it('should store a snapshot with correct structure', async () => {
      stubCapture();
      const store = new SnapshotStore(20, 0);
      const snap = await store.capture(client);
      assert.ok(snap);
      assert.strictEqual(store.snapshots.length, 1);
      const t = snap.tables.get('users');
      assert.ok(t);
      assert.strictEqual(t.rowCount, 3);
      assert.deepStrictEqual(t.columns, ['id', 'name']);
      assert.deepStrictEqual(t.pkColumns, ['id']);
      assert.strictEqual(t.rows.length, 3);
      assert.deepStrictEqual(t.rows[0], { id: 1, name: 'Alice' });
    });

    it('should enforce maxSnapshots rolling window', async () => {
      stubCapture();
      const store = new SnapshotStore(2, 0);
      await store.capture(client);
      clock.tick(1);
      await store.capture(client);
      clock.tick(1);
      await store.capture(client);
      assert.strictEqual(store.snapshots.length, 2);
    });

    it('should fire onDidChange after capture', async () => {
      stubCapture();
      const store = new SnapshotStore(20, 0);
      let fired = false;
      store.onDidChange(() => { fired = true; });
      await store.capture(client);
      assert.strictEqual(fired, true);
    });

    it('should debounce captures within minIntervalMs', async () => {
      stubCapture();
      const store = new SnapshotStore(20, 5000);
      const snap1 = await store.capture(client);
      assert.ok(snap1);
      const snap2 = await store.capture(client);
      assert.strictEqual(snap2, null);
      clock.tick(5000);
      const snap3 = await store.capture(client);
      assert.ok(snap3);
      assert.strictEqual(store.snapshots.length, 2);
    });

    it('should capture immediately when bypassDebounce is set (bulk edit timeline)', async () => {
      stubCapture();
      const store = new SnapshotStore(20, 5000);
      const snap1 = await store.capture(client);
      assert.ok(snap1);
      const snap2 = await store.capture(client, { bypassDebounce: true });
      assert.ok(snap2);
      assert.strictEqual(store.snapshots.length, 2);
    });

    it('should return null on API failure', async () => {
      fetchStub.rejects(new Error('network error'));
      const store = new SnapshotStore(20, 0);
      const promise = store.capture(client);
      await clock.tickAsync(300); // advance past fetchWithRetry 200ms retry delay
      const snap = await promise;
      assert.strictEqual(snap, null);
    });

    it('should skip tables that fail to query and capture the rest', async () => {
      // Two tables: "good" succeeds, "bad" throws (e.g. dropped since metadata fetch).
      fetchStub.withArgs(sinon.match(/schema\/metadata/)).callsFake(async () =>
        makeResponse(metadataJson([
          { name: 'good', rowCount: 1, columns: [{ name: 'id', type: 'INTEGER', pk: true }] },
          { name: 'bad', rowCount: 0, columns: [{ name: 'id', type: 'INTEGER', pk: true }] },
        ])),
      );

      let callCount = 0;
      fetchStub.withArgs(sinon.match(/api\/sql/)).callsFake(async () => {
        callCount++;
        // First call is for "good", second for "bad".
        if (callCount === 1) {
          return makeResponse(sqlJson(['id'], [[1]]));
        }
        // Simulate server returning a 500 with an error body.
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: 'no such table: bad' }),
        } as unknown as Response;
      });

      const store = new SnapshotStore(20, 0);
      const promise = store.capture(client);
      await clock.tickAsync(300); // advance past any retry delays
      const snap = await promise;

      assert.ok(snap, 'snapshot should not be null');
      // The "good" table should be captured; "bad" should be skipped.
      assert.ok(snap.tables.has('good'), 'good table should be present');
      assert.strictEqual(snap.tables.has('bad'), false, 'bad table should be skipped');
      assert.strictEqual(snap.tables.get('good')!.rows.length, 1);
    });

    it('captures tables above CAPTURE_MAX_ROWS metadata-only, issuing no SELECT for them', async () => {
      // Defect A: a huge table must not get a per-table SELECT * — its captured
      // rows would be a misleading first-1000 slice and the read is one of the
      // expensive pulls that stall the host's startup. Metadata (rowCount /
      // columns / pk) is still recorded so the timeline shows the count delta.
      fetchStub.withArgs(sinon.match(/schema\/metadata/)).callsFake(async () =>
        makeResponse(metadataJson([
          {
            name: 'huge',
            rowCount: CAPTURE_MAX_ROWS + 1,
            columns: [
              { name: 'id', type: 'INTEGER', pk: true },
              { name: 'blob', type: 'TEXT', pk: false },
            ],
          },
          { name: 'small', rowCount: 2, columns: [{ name: 'id', type: 'INTEGER', pk: true }] },
        ])),
      );

      const sentSql: string[] = [];
      fetchStub.withArgs(sinon.match(/api\/sql/)).callsFake(async (_url, init) => {
        sentSql.push(JSON.parse((init as RequestInit).body as string).sql);
        return makeResponse(sqlJson(['id'], [[1], [2]]));
      });

      const store = new SnapshotStore(20, 0);
      const snap = await store.capture(client);
      assert.ok(snap);

      const huge = snap.tables.get('huge');
      assert.ok(huge, 'huge table should be present');
      assert.strictEqual(huge.rows.length, 0, 'huge table captured metadata-only');
      assert.strictEqual(huge.rowCount, CAPTURE_MAX_ROWS + 1);
      assert.deepStrictEqual(huge.columns, ['id', 'blob'], 'columns come from metadata');
      assert.deepStrictEqual(huge.pkColumns, ['id']);

      // The small table is read; no SELECT references the huge table.
      assert.ok(snap.tables.get('small')!.rows.length === 2);
      assert.ok(
        sentSql.every((s) => !s.includes('"huge"')),
        `huge table must not be queried, got: ${sentSql.join(' | ')}`,
      );
    });

    it('throttles between per-table reads when interTableYieldMs is set', async () => {
      // Defect B: with a nonzero inter-table yield, the capture must not finish
      // synchronously — the second table's read is gated behind a real delay so
      // the host's own queries can interleave on the shared connection. Drive
      // the fake clock to prove the gap blocks then releases the read.
      fetchStub.withArgs(sinon.match(/schema\/metadata/)).callsFake(async () =>
        makeResponse(metadataJson([
          { name: 't1', rowCount: 1, columns: [{ name: 'id', type: 'INTEGER', pk: true }] },
          { name: 't2', rowCount: 1, columns: [{ name: 'id', type: 'INTEGER', pk: true }] },
        ])),
      );
      let sqlCalls = 0;
      fetchStub.withArgs(sinon.match(/api\/sql/)).callsFake(async () => {
        sqlCalls++;
        return makeResponse(sqlJson(['id'], [[1]]));
      });

      const store = new SnapshotStore(20, 0, 200, undefined, 50);
      let resolved = false;
      const promise = store.capture(client).then((s) => { resolved = true; return s; });

      // Flush metadata + the first table's read; the second is held by the 50ms
      // throttle, so the capture has not completed.
      await clock.tickAsync(0);
      assert.strictEqual(resolved, false, 'capture should be blocked on the inter-table throttle');
      assert.strictEqual(sqlCalls, 1, 'only the first table read before the throttle elapses');

      await clock.tickAsync(50);
      const snap = await promise;
      assert.ok(snap);
      assert.strictEqual(sqlCalls, 2, 'second table read after the throttle elapses');
      assert.strictEqual(resolved, true);
    });

    it('sweeps rowid-less relations without ORDER BY rowid (GitHub #32)', async () => {
      // PowerSync exposes user tables as views (no rowid) and uses WITHOUT
      // ROWID system tables such as ps_updated_rows. ORDER BY rowid threw
      // "no such column: rowid" and aborted the sweep on them. The sweep must
      // now order by the declared PK, or omit ordering when none is declared.
      fetchStub.withArgs(sinon.match(/schema\/metadata/)).callsFake(async () =>
        makeResponse(metadataJson([
          // WITHOUT ROWID system table: composite PK, no rowid.
          {
            name: 'ps_updated_rows',
            rowCount: 1,
            columns: [
              { name: 'row_type', type: 'TEXT', pk: true },
              { name: 'row_id', type: 'TEXT', pk: true },
            ],
          },
          // PowerSync table view: keyed on id but PRAGMA reports no PK.
          {
            name: 'todos',
            rowCount: 1,
            columns: [
              { name: 'id', type: 'TEXT', pk: false },
              { name: 'data', type: 'TEXT', pk: false },
            ],
          },
        ])),
      );

      const sentSql: string[] = [];
      fetchStub.withArgs(sinon.match(/api\/sql/)).callsFake(async (_url, init) => {
        sentSql.push(JSON.parse((init as RequestInit).body as string).sql);
        return makeResponse(sqlJson(['id'], [[1]]));
      });

      const store = new SnapshotStore(20, 0);
      const snap = await store.capture(client);
      assert.ok(snap);
      // Both relations captured, neither skipped by a rowid error.
      assert.ok(snap.tables.has('ps_updated_rows'));
      assert.ok(snap.tables.has('todos'));

      // No emitted sweep references rowid.
      assert.ok(
        sentSql.every((s) => !s.includes('rowid')),
        `expected no rowid in sweeps, got: ${sentSql.join(' | ')}`,
      );
      // Composite-PK table orders by its PK columns.
      assert.ok(
        sentSql.some((s) =>
          s.includes('FROM "ps_updated_rows" ORDER BY "row_type", "row_id"')),
      );
      // No-PK view falls back to no ORDER BY clause.
      assert.ok(
        sentSql.some((s) => /FROM "todos"\s+LIMIT/.test(s)),
      );
    });
  });

  describe('requestCapture() — write-burst coalescing', () => {
    it('coalesces a burst of writes into exactly one capture after the quiet window', async () => {
      stubCapture();
      const store = new SnapshotStore(20, 0, 200);
      store.requestCapture(client);
      await clock.tickAsync(100);
      // Second write lands inside the window and must reset the timer, not
      // kick off its own re-dump.
      store.requestCapture(client);
      await clock.tickAsync(100);
      store.requestCapture(client);
      // 200ms has elapsed since the first write but only 100ms since the last,
      // so nothing should have fired yet.
      assert.strictEqual(store.snapshots.length, 0);
      await clock.tickAsync(200);
      assert.strictEqual(store.snapshots.length, 1);
    });

    it('logs one coalesced-count line naming how many writes collapsed', async () => {
      stubCapture();
      const logs: string[] = [];
      const store = new SnapshotStore(20, 0, 200, (m) => logs.push(m));
      store.requestCapture(client);
      store.requestCapture(client);
      store.requestCapture(client);
      await clock.tickAsync(200);
      assert.strictEqual(store.snapshots.length, 1);
      assert.ok(
        logs.includes('timeline: re-dump (coalesced 3 writes)'),
        logs.join(' | '),
      );
    });

    it('uses singular wording for a single coalesced write', async () => {
      stubCapture();
      const logs: string[] = [];
      const store = new SnapshotStore(20, 0, 200, (m) => logs.push(m));
      store.requestCapture(client);
      await clock.tickAsync(200);
      assert.ok(
        logs.includes('timeline: re-dump (coalesced 1 write)'),
        logs.join(' | '),
      );
    });

    it('bypasses the minIntervalMs floor so the final write is never dropped', async () => {
      stubCapture();
      const store = new SnapshotStore(20, 10_000, 200);
      // A prior immediate capture sets the minIntervalMs floor.
      const first = await store.capture(client);
      assert.ok(first);
      // A debounced write lands well inside the 10s floor; it must still
      // capture so the open page reflects the latest committed state.
      store.requestCapture(client);
      await clock.tickAsync(200);
      assert.strictEqual(store.snapshots.length, 2);
    });
  });

  describe('getById()', () => {
    it('should return snapshot by id', async () => {
      stubCapture();
      const store = new SnapshotStore(20, 0);
      const snap = await store.capture(client);
      assert.ok(snap);
      assert.strictEqual(store.getById(snap.id), snap);
    });

    it('should return undefined for unknown id', () => {
      const store = new SnapshotStore();
      assert.strictEqual(store.getById('nope'), undefined);
    });
  });

  describe('getNewerSnapshot()', () => {
    it('should return the next snapshot in sequence', async () => {
      stubCapture();
      const store = new SnapshotStore(20, 0);
      const snap1 = await store.capture(client);
      clock.tick(1);
      const snap2 = await store.capture(client);
      assert.ok(snap1 && snap2);
      assert.strictEqual(store.getNewerSnapshot(snap1), snap2);
    });

    it('should return undefined for the latest snapshot', async () => {
      stubCapture();
      const store = new SnapshotStore(20, 0);
      const snap = await store.capture(client);
      assert.ok(snap);
      assert.strictEqual(store.getNewerSnapshot(snap), undefined);
    });
  });

  describe('clear()', () => {
    it('should remove all snapshots and fire event', async () => {
      stubCapture();
      const store = new SnapshotStore(20, 0);
      await store.capture(client);
      let fired = false;
      store.onDidChange(() => { fired = true; });
      store.clear();
      assert.strictEqual(store.snapshots.length, 0);
      assert.strictEqual(fired, true);
    });
  });
});

describe('rowsToObjects', () => {
  it('should convert array rows to keyed objects', () => {
    const result = rowsToObjects(['a', 'b'], [[1, 2], [3, 4]]);
    assert.deepStrictEqual(result, [{ a: 1, b: 2 }, { a: 3, b: 4 }]);
  });
});

describe('computeTableDiff', () => {
  it('should identify added rows by PK', () => {
    const diff = computeTableDiff(
      'users', ['id', 'name'], ['id'],
      [{ id: 1, name: 'Alice' }],
      [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
      1, 2,
    );
    assert.strictEqual(diff.addedRows.length, 1);
    assert.deepStrictEqual(diff.addedRows[0], { id: 2, name: 'Bob' });
    assert.strictEqual(diff.removedRows.length, 0);
    assert.strictEqual(diff.changedRows.length, 0);
  });

  it('should identify removed rows by PK', () => {
    const diff = computeTableDiff(
      'users', ['id', 'name'], ['id'],
      [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
      [{ id: 1, name: 'Alice' }],
      2, 1,
    );
    assert.strictEqual(diff.removedRows.length, 1);
    assert.deepStrictEqual(diff.removedRows[0], { id: 2, name: 'Bob' });
  });

  it('should identify changed rows with changedColumns', () => {
    const diff = computeTableDiff(
      'users', ['id', 'name'], ['id'],
      [{ id: 1, name: 'Alice' }],
      [{ id: 1, name: 'Alicia' }],
      1, 1,
    );
    assert.strictEqual(diff.changedRows.length, 1);
    assert.deepStrictEqual(diff.changedRows[0].changedColumns, ['name']);
    assert.strictEqual(diff.changedRows[0].before.name, 'Alice');
    assert.strictEqual(diff.changedRows[0].after.name, 'Alicia');
  });

  it('should handle tables with no PK (signature mode)', () => {
    const diff = computeTableDiff(
      'logs', ['msg'], [],
      [{ msg: 'a' }, { msg: 'b' }],
      [{ msg: 'b' }, { msg: 'c' }],
      2, 2,
    );
    assert.strictEqual(diff.addedRows.length, 1);
    assert.deepStrictEqual(diff.addedRows[0], { msg: 'c' });
    assert.strictEqual(diff.removedRows.length, 1);
    assert.deepStrictEqual(diff.removedRows[0], { msg: 'a' });
    assert.strictEqual(diff.changedRows.length, 0);
  });

  it('should handle no differences', () => {
    const diff = computeTableDiff(
      'users', ['id', 'name'], ['id'],
      [{ id: 1, name: 'Alice' }],
      [{ id: 1, name: 'Alice' }],
      1, 1,
    );
    assert.strictEqual(diff.addedRows.length, 0);
    assert.strictEqual(diff.removedRows.length, 0);
    assert.strictEqual(diff.changedRows.length, 0);
  });

  it('should handle empty inputs', () => {
    const diff = computeTableDiff('t', ['id'], ['id'], [], [], 0, 0);
    assert.strictEqual(diff.addedRows.length, 0);
    assert.strictEqual(diff.removedRows.length, 0);
  });

  it('should handle duplicate rows in signature mode', () => {
    const diff = computeTableDiff(
      'logs', ['msg'], [],
      [{ msg: 'a' }, { msg: 'a' }],
      [{ msg: 'a' }],
      2, 1,
    );
    assert.strictEqual(diff.addedRows.length, 0);
    assert.strictEqual(diff.removedRows.length, 1);
  });
});
