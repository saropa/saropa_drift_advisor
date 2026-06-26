/**
 * Tests for the snapshot → branch conversion (Feature 60 Phase 5: "Create Branch Here").
 *
 * Covers: PK metadata synthesis from the snapshot's captured pkColumns, `sqlite_*` exclusion,
 * truncation flagging when a table's real rowCount exceeds the captured rows, row pass-through,
 * and the empty-snapshot case.
 */

import * as assert from 'assert';
import { snapshotToBranchTables } from '../branching/snapshot-to-branch';
import type { ISnapshot, ISnapshotTable } from '../timeline/snapshot-types';

function snapTable(
  columns: string[],
  pkColumns: string[],
  rows: Record<string, unknown>[],
  rowCount?: number,
): ISnapshotTable {
  return { columns, pkColumns, rows, rowCount: rowCount ?? rows.length };
}

function snapshot(tables: Record<string, ISnapshotTable>): ISnapshot {
  return {
    id: '2026-01-01T00:00:00.000Z',
    timestamp: 1_767_225_600_000,
    tables: new Map(Object.entries(tables)),
  };
}

describe('snapshotToBranchTables', () => {
  it('synthesizes column metadata and marks PK columns', () => {
    const snap = snapshot({
      users: snapTable(
        ['id', 'name', 'email'],
        ['id'],
        [{ id: 1, name: 'A', email: 'a@x.com' }],
      ),
    });

    const { tables } = snapshotToBranchTables(snap);

    assert.strictEqual(tables.length, 1);
    const users = tables[0];
    assert.strictEqual(users.name, 'users');
    assert.deepStrictEqual(users.pkColumns, ['id']);
    assert.deepStrictEqual(
      users.columns,
      [
        { name: 'id', type: '', pk: true },
        { name: 'name', type: '', pk: false },
        { name: 'email', type: '', pk: false },
      ],
    );
    // Rows are passed through unchanged (the snapshot already holds them).
    assert.deepStrictEqual(users.rows, [{ id: 1, name: 'A', email: 'a@x.com' }]);
  });

  it('supports composite primary keys', () => {
    const snap = snapshot({
      memberships: snapTable(['user_id', 'group_id', 'role'], ['user_id', 'group_id'], []),
    });

    const { tables } = snapshotToBranchTables(snap);

    assert.deepStrictEqual(tables[0].pkColumns, ['user_id', 'group_id']);
    assert.deepStrictEqual(
      tables[0].columns.filter((c) => c.pk).map((c) => c.name),
      ['user_id', 'group_id'],
    );
  });

  it('excludes sqlite_ internal tables', () => {
    const snap = snapshot({
      users: snapTable(['id'], ['id'], [{ id: 1 }]),
      sqlite_sequence: snapTable(['name', 'seq'], [], [{ name: 'users', seq: 1 }]),
    });

    const { tables } = snapshotToBranchTables(snap);

    assert.deepStrictEqual(tables.map((t) => t.name), ['users']);
  });

  it('flags truncation when captured rows are fewer than the real rowCount', () => {
    const snap = snapshot({
      // 3 rows captured but the table actually had 1000 — partial branch.
      big: snapTable(['id'], ['id'], [{ id: 1 }, { id: 2 }, { id: 3 }], 1000),
    });

    const { truncated } = snapshotToBranchTables(snap);

    assert.strictEqual(truncated, true);
  });

  it('does not flag truncation when all rows were captured', () => {
    const snap = snapshot({
      small: snapTable(['id'], ['id'], [{ id: 1 }, { id: 2 }], 2),
    });

    const { truncated } = snapshotToBranchTables(snap);

    assert.strictEqual(truncated, false);
  });

  it('empty snapshot yields no tables and no truncation', () => {
    const { tables, truncated } = snapshotToBranchTables(snapshot({}));

    assert.deepStrictEqual(tables, []);
    assert.strictEqual(truncated, false);
  });
});
