/**
 * Phase 2 gate for Data Branching (Feature 37): the pure branch diff engine.
 * Covers no-change, insert/update/delete-only, mixed, cross-branch one-sided tables,
 * composite-PK matching, and no-PK signature fallback.
 */

import * as assert from 'assert';
import { diffTable, diffBranches } from '../branching/branch-diff';
import type { IBranchTable, IDataBranch } from '../branching/branch-types';

function col(name: string, pk = false) {
  return { name, type: 'TEXT', pk };
}

function bt(
  name: string,
  cols: { name: string; type: string; pk: boolean }[],
  rows: Record<string, unknown>[],
): IBranchTable {
  return { name, columns: cols, rows, pkColumns: cols.filter((c) => c.pk).map((c) => c.name) };
}

function branch(name: string, tables: IBranchTable[]): IDataBranch {
  return {
    id: name,
    name,
    createdAt: '2026-01-01T00:00:00.000Z',
    tables,
    metadata: { tableCount: tables.length, totalRows: 0, truncated: false },
  };
}

const COLS = [col('id', true), col('status')];

describe('branch-diff', () => {
  it('no changes → empty diff, all zeros', () => {
    const t = bt('orders', COLS, [{ id: 1, status: 'a' }]);
    const d = diffBranches(branch('A', [t]), branch('B', [bt('orders', COLS, [{ id: 1, status: 'a' }])]));
    assert.deepStrictEqual(d.summary, { inserts: 0, updates: 0, deletes: 0, tablesChanged: 0 });
    assert.strictEqual(d.tableDiffs.length, 0);
  });

  it('inserts only → rows present in B not A', () => {
    const d = diffTable(
      'orders',
      bt('orders', COLS, [{ id: 1, status: 'a' }]),
      bt('orders', COLS, [{ id: 1, status: 'a' }, { id: 2, status: 'b' }]),
    );
    assert.strictEqual(d.inserts.length, 1);
    assert.strictEqual(d.inserts[0].id, 2);
    assert.strictEqual(d.updates.length, 0);
    assert.strictEqual(d.deletes.length, 0);
  });

  it('deletes only → rows present in A not B', () => {
    const d = diffTable(
      'orders',
      bt('orders', COLS, [{ id: 1, status: 'a' }, { id: 2, status: 'b' }]),
      bt('orders', COLS, [{ id: 1, status: 'a' }]),
    );
    assert.strictEqual(d.deletes.length, 1);
    assert.strictEqual(d.deletes[0].id, 2);
  });

  it('updates only → changed columns captured with before/after', () => {
    const d = diffTable(
      'orders',
      bt('orders', COLS, [{ id: 1, status: 'pending' }]),
      bt('orders', COLS, [{ id: 1, status: 'shipped' }]),
    );
    assert.strictEqual(d.updates.length, 1);
    assert.deepStrictEqual(d.updates[0].changes, [
      { column: 'status', oldValue: 'pending', newValue: 'shipped' },
    ]);
    assert.deepStrictEqual(d.updates[0].pkValues, { id: 1 });
  });

  it('mixed → all three change types present and counted', () => {
    const d = diffBranches(
      branch('A', [bt('orders', COLS, [{ id: 1, status: 'a' }, { id: 2, status: 'b' }, { id: 3, status: 'c' }])]),
      branch('B', [bt('orders', COLS, [{ id: 1, status: 'a' }, { id: 2, status: 'B' }, { id: 4, status: 'd' }])]),
    );
    assert.deepStrictEqual(d.summary, { inserts: 1, updates: 1, deletes: 1, tablesChanged: 1 });
  });

  it('cross-branch: table only in A → all rows are deletes', () => {
    const d = diffBranches(
      branch('A', [bt('only_a', COLS, [{ id: 1, status: 'x' }, { id: 2, status: 'y' }])]),
      branch('B', []),
    );
    assert.strictEqual(d.tableDiffs[0].deletes.length, 2);
    assert.strictEqual(d.summary.deletes, 2);
  });

  it('cross-branch: table only in B → all rows are inserts', () => {
    const d = diffBranches(
      branch('A', []),
      branch('B', [bt('only_b', COLS, [{ id: 1, status: 'x' }])]),
    );
    assert.strictEqual(d.tableDiffs[0].inserts.length, 1);
  });

  it('composite PK: rows keyed on all PK columns', () => {
    const cols = [col('a', true), col('b', true), col('v')];
    const d = diffTable(
      't',
      bt('t', cols, [{ a: 1, b: 1, v: 'x' }, { a: 1, b: 2, v: 'y' }]),
      bt('t', cols, [{ a: 1, b: 1, v: 'x' }, { a: 1, b: 2, v: 'CHANGED' }]),
    );
    assert.strictEqual(d.updates.length, 1);
    assert.deepStrictEqual(d.updates[0].pkValues, { a: 1, b: 2 });
  });

  it('no PK: identical rows match by full-row signature (no false insert/delete)', () => {
    const cols = [col('x'), col('y')];
    const d = diffTable(
      't',
      bt('t', cols, [{ x: 1, y: 2 }]),
      bt('t', cols, [{ x: 1, y: 2 }]),
    );
    assert.strictEqual(d.inserts.length, 0);
    assert.strictEqual(d.deletes.length, 0);
    assert.strictEqual(d.updates.length, 0);
  });
});
